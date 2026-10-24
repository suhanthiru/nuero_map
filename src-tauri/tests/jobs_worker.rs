mod common;

use std::sync::Arc;

use neural_map_lib::commands::import::queue_import;
use neural_map_lib::db::Db;
use neural_map_lib::embed::fake::FakeEmbedder;
use neural_map_lib::events::{RecordingSink, JOB_FINISHED, JOB_PROGRESS};
use neural_map_lib::ingest::detect::RequestedSource;
use neural_map_lib::jobs::handlers::JobContext;
use neural_map_lib::jobs::queue;
use neural_map_lib::jobs::worker::Worker;
use neural_map_lib::jobs::{JobHandle, JobPayload};
use neural_map_lib::llm::fake::FakeLlm;
use neural_map_lib::secrets::MemoryStore;

struct Harness {
    db: Db,
    sink: Arc<RecordingSink>,
    jobs: JobHandle,
    worker: Worker,
}

fn harness() -> Harness {
    harness_with(MemoryStore::with_key("sk-ant-test"))
}

fn harness_with(keys: MemoryStore) -> Harness {
    let db = Db::open_in_memory().unwrap();
    let sink = Arc::new(RecordingSink::default());
    let jobs = JobHandle::default();
    let ctx = JobContext {
        db: db.clone(),
        sink: sink.clone(),
        llm: Arc::new(FakeLlm::new(|_| Ok(r#"{"ideas":[]}"#.to_owned()))),
        keys: Arc::new(keys),
        embedder: Arc::new(FakeEmbedder),
    };
    let worker = Worker::new(ctx, jobs.clone());
    Harness {
        db,
        sink,
        jobs,
        worker,
    }
}

fn import_payload(path: &std::path::Path) -> JobPayload {
    JobPayload::Import {
        path: path.display().to_string(),
        source: RequestedSource::Auto,
        expected_conversations: Some(4),
    }
}

fn claude_zip(dir: &std::path::Path) -> std::path::PathBuf {
    common::make_zip(
        dir,
        "claude.zip",
        &[
            (
                "conversations.json",
                &common::fixture_text("claude/conversations_mixed.json"),
            ),
            ("users.json", "[]"),
        ],
    )
}

fn count(db: &Db, sql: &'static str) -> i64 {
    db.call_blocking(move |c| Ok(c.query_row(sql, [], |r| r.get(0))?))
        .unwrap()
}

#[test]
fn runs_an_import_job_and_reports_progress_and_completion() {
    let dir = tempfile::tempdir().unwrap();
    let h = harness();
    let id = queue_import(&h.db, &h.jobs, import_payload(&claude_zip(dir.path()))).unwrap();

    assert_eq!(
        h.worker.drain().unwrap(),
        4,
        "import, then extract, assign, link"
    );

    let view = h.db.call_blocking(|c| queue::view(c, id)).unwrap().unwrap();
    assert_eq!(view.status, "done");
    assert_eq!(count(&h.db, "select count(*) from conversations"), 4);
    let stages: Vec<String> = h
        .sink
        .named(JOB_PROGRESS)
        .iter()
        .map(|p| p["stage"].as_str().unwrap().to_owned())
        .collect();
    assert_eq!(stages.first().map(String::as_str), Some("parsing"));
    assert_eq!(stages.last().map(String::as_str), Some("done"));
    let finished = h.sink.named(JOB_FINISHED);
    assert_eq!(finished.len(), 4);
    assert!(finished
        .iter()
        .all(|f| f["ok"] == true && f["rootJobId"] == *id.to_string()));
    assert_eq!(finished[0]["pipelineDone"], false);
    assert_eq!(finished[3]["pipelineDone"], true);
}

#[test]
fn a_bad_export_fails_once_without_retrying() {
    let dir = tempfile::tempdir().unwrap();
    let zip = common::make_zip(dir.path(), "x.zip", &[("readme.txt", "hi")]);
    let h = harness();
    let id = queue_import(&h.db, &h.jobs, import_payload(&zip)).unwrap();

    h.worker.drain().unwrap();

    let view = h.db.call_blocking(|c| queue::view(c, id)).unwrap().unwrap();
    assert_eq!(view.status, "failed");
    assert_eq!(view.error_code.as_deref(), Some("bad_zip"));
    let finished = h.sink.named(JOB_FINISHED);
    assert_eq!(finished[0]["ok"], false);
    assert_eq!(finished[0]["errorCode"], "bad_zip");
}

#[test]
fn a_second_import_while_one_is_queued_is_busy() {
    let dir = tempfile::tempdir().unwrap();
    let h = harness();
    let zip = claude_zip(dir.path());

    queue_import(&h.db, &h.jobs, import_payload(&zip)).unwrap();
    let err = queue_import(&h.db, &h.jobs, import_payload(&zip)).unwrap_err();

    assert_eq!(err.code(), "busy");
}

#[test]
fn resumes_a_job_interrupted_by_a_crash() {
    let dir = tempfile::tempdir().unwrap();
    let h = harness();
    let id = queue_import(&h.db, &h.jobs, import_payload(&claude_zip(dir.path()))).unwrap();
    // Simulate a crash: the job was claimed (running) but never finished.
    h.db.call_blocking(|c| queue::claim_next(c)).unwrap();
    assert_eq!(
        h.worker.drain().unwrap(),
        0,
        "running jobs are not re-claimed without recovery"
    );

    assert_eq!(h.worker.recover().unwrap(), 1);
    assert_eq!(
        h.worker.drain().unwrap(),
        4,
        "the resumed import, then the rest of its pipeline"
    );

    let view = h.db.call_blocking(|c| queue::view(c, id)).unwrap().unwrap();
    assert_eq!(view.status, "done");
}

#[test]
fn a_capture_job_runs_extraction_and_tags_the_pipeline_as_capture() {
    let h = harness();
    let id = h
        .db
        .call_blocking(|c| match queue::enqueue(c, &JobPayload::Capture, None)? {
            queue::Enqueued::Created(id) | queue::Enqueued::Existing(id) => Ok(id),
        })
        .unwrap();

    assert_eq!(h.worker.drain().unwrap(), 4, "capture, then extract, assign, link");

    let finished = h.sink.named(JOB_FINISHED);
    assert!(finished
        .iter()
        .all(|f| f["ok"] == true && f["rootKind"] == "capture" && f["rootJobId"] == *id.to_string()));
    assert!(h
        .sink
        .named(JOB_PROGRESS)
        .iter()
        .all(|p| p["rootKind"] == "capture"));
}

#[test]
fn a_capture_job_without_an_api_key_finishes_quietly() {
    let h = harness_with(MemoryStore::default());
    h.db.call_blocking(|c| queue::enqueue(c, &JobPayload::Capture, None).map(|_| ()))
        .unwrap();

    assert_eq!(h.worker.drain().unwrap(), 1, "no extraction is queued without a key");

    let finished = h.sink.named(JOB_FINISHED);
    assert_eq!(finished.len(), 1);
    assert_eq!(finished[0]["ok"], true);
    assert_eq!(count(&h.db, "select count(*) from jobs where status = 'failed'"), 0);
}
