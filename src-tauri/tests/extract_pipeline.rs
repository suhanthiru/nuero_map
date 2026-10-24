mod common;

use std::sync::Arc;

use neural_map_lib::commands::import::queue_import;
use neural_map_lib::db::Db;
use neural_map_lib::embed::fake::FakeEmbedder;
use neural_map_lib::events::{RecordingSink, JOB_FINISHED};
use neural_map_lib::ingest::detect::RequestedSource;
use neural_map_lib::jobs::handlers::JobContext;
use neural_map_lib::jobs::worker::Worker;
use neural_map_lib::jobs::{JobHandle, JobPayload};
use neural_map_lib::llm::fake::FakeLlm;
use neural_map_lib::llm::types::MessageRequest;
use neural_map_lib::secrets::{ApiKeyStore, MemoryStore};

/// Replies with one idea quoting the first 30 characters of window message 0.
fn one_idea_per_window(req: &MessageRequest) -> neural_map_lib::error::AppResult<String> {
    let transcript = req.messages[0].content.as_str().unwrap_or_default();
    let start = transcript
        .find("<msg i=\"0\"")
        .expect("window has message 0");
    let body_start = start + transcript[start..].find('>').unwrap() + 1;
    let body_end = body_start + transcript[body_start..].find("</msg>").unwrap();
    let excerpt: String = transcript[body_start..body_end].chars().take(30).collect();
    Ok(serde_json::json!({"ideas": [{
        "title": "An idea", "summary": "Summary.", "kind": "insight", "topic_label": "Neural map app",
        "topic_aliases": [], "source_message_indices": [0], "excerpt": excerpt,
        "is_user_originated": true, "gem_candidate": false, "related_idea_indices": []
    }]})
    .to_string())
}

struct Harness {
    db: Db,
    sink: Arc<RecordingSink>,
    jobs: JobHandle,
    llm: Arc<FakeLlm>,
    worker: Worker,
}

fn harness(keys: MemoryStore, llm: FakeLlm) -> Harness {
    let db = Db::open_in_memory().unwrap();
    let sink = Arc::new(RecordingSink::default());
    let jobs = JobHandle::default();
    let llm = Arc::new(llm);
    let keys: Arc<dyn ApiKeyStore> = Arc::new(keys);
    let ctx = JobContext {
        db: db.clone(),
        sink: sink.clone(),
        llm: llm.clone(),
        keys,
        embedder: Arc::new(FakeEmbedder),
    };
    let worker = Worker::new(ctx, jobs.clone());
    Harness {
        db,
        sink,
        jobs,
        llm,
        worker,
    }
}

fn count(db: &Db, sql: &'static str) -> i64 {
    db.call_blocking(move |c| Ok(c.query_row(sql, [], |r| r.get(0))?))
        .unwrap()
}

fn import(h: &Harness, zip: &std::path::Path) -> i64 {
    let payload = JobPayload::Import {
        path: zip.display().to_string(),
        source: RequestedSource::Auto,
        expected_conversations: None,
    };
    queue_import(&h.db, &h.jobs, payload).unwrap()
}

/// Makes delayed jobs (batch polls) runnable now, then drains.
fn drain_now(h: &Harness) -> usize {
    h.db.call_blocking(|c| {
        Ok(c.execute(
            "update jobs set run_after = '0000' where status = 'queued'",
            [],
        )?)
    })
    .unwrap();
    h.worker.drain().unwrap()
}

/// (message id, sender, text)
type Msg<'a> = (&'a str, &'a str, &'a str);
/// (conversation id, messages)
type Conv<'a> = (String, Vec<Msg<'a>>);

fn claude_export(convs: &[Conv]) -> String {
    let items: Vec<serde_json::Value> = convs
        .iter()
        .map(|(id, msgs)| {
            let messages: Vec<serde_json::Value> = msgs
                .iter()
                .map(|(mid, sender, text)| serde_json::json!({"uuid": mid, "sender": sender, "text": text, "created_at": "2026-02-01T10:00:00Z"}))
                .collect();
            serde_json::json!({"uuid": id, "name": id, "created_at": "2026-02-01T10:00:00Z", "updated_at": format!("2026-02-01T10:00:{:02}Z", msgs.len()), "chat_messages": messages})
        })
        .collect();
    serde_json::Value::Array(items).to_string()
}

fn zip_of(dir: &std::path::Path, name: &str, body: &str) -> std::path::PathBuf {
    common::make_zip(
        dir,
        name,
        &[("conversations.json", body), ("users.json", "[]")],
    )
}

#[test]
fn import_then_direct_extraction_stores_verified_ideas() {
    let dir = tempfile::tempdir().unwrap();
    let h = harness(
        MemoryStore::with_key("sk-ant-test"),
        FakeLlm::new(one_idea_per_window),
    );
    let zip = zip_of(
        dir.path(),
        "a.zip",
        &common::fixture_text("claude/conversations_mixed.json"),
    );
    let root = import(&h, &zip);

    assert_eq!(
        h.worker.drain().unwrap(),
        4,
        "import, extract, assign, link"
    );

    assert_eq!(
        count(
            &h.db,
            "select count(*) from extraction_windows where status = 'done'"
        ),
        4
    );
    assert_eq!(
        count(
            &h.db,
            "select count(*) from ideas where excerpt_verified = 1"
        ),
        4
    );
    assert_eq!(count(&h.db, "select count(*) from idea_messages"), 4);
    assert_eq!(count(&h.db, "select count(*) from llm_calls"), 4);
    let finished = h.sink.named(JOB_FINISHED);
    assert_eq!(finished.len(), 4);
    assert!(finished.iter().all(|f| f["rootJobId"] == *root.to_string()));
    assert!(
        finished[..3].iter().all(|f| f["pipelineDone"] == false),
        "later steps were still queued"
    );
    assert_eq!(finished[3]["pipelineDone"], true);
    // Every idea landed in a topic; the fixture's ideas all share one label.
    assert_eq!(
        count(&h.db, "select count(*) from ideas where topic_id is null"),
        0
    );
    assert_eq!(count(&h.db, "select count(*) from topics"), 1);
    assert_eq!(count(&h.db, "select idea_count from topics"), 4);
    assert!(
        count(&h.db, "select count(*) from topics where decay_score > 0") == 1,
        "decay was computed"
    );
}

#[test]
fn many_windows_go_through_a_batch_that_is_polled_until_it_ends() {
    let dir = tempfile::tempdir().unwrap();
    let h = harness(
        MemoryStore::with_key("sk-ant-test"),
        FakeLlm::new(one_idea_per_window).with_polls_before_end(2),
    );
    let convs: Vec<Conv> = (0..25)
        .map(|i| {
            (
                format!("c{i}"),
                vec![
                    ("m1", "human", "A thought worth keeping about graphs."),
                    ("m2", "assistant", "A reply."),
                ],
            )
        })
        .collect();
    // Message ids must be unique per conversation only; reuse is fine across conversations.
    import(&h, &zip_of(dir.path(), "b.zip", &claude_export(&convs)));

    h.worker.drain().unwrap(); // import + extract (submits the batch)
    assert_eq!(
        count(
            &h.db,
            "select count(*) from extraction_windows where status = 'submitted'"
        ),
        25
    );
    drain_now(&h); // first poll: still processing -> rescheduled
    assert_eq!(
        count(
            &h.db,
            "select count(*) from jobs where kind = 'poll_batch' and status = 'queued'"
        ),
        1
    );
    drain_now(&h); // second poll: ended -> results stored

    assert_eq!(
        count(
            &h.db,
            "select count(*) from extraction_windows where status = 'done'"
        ),
        25
    );
    assert_eq!(count(&h.db, "select count(*) from ideas"), 25);
    assert_eq!(
        h.sink.named(JOB_FINISHED).last().unwrap()["pipelineDone"],
        true
    );
}

#[test]
fn without_a_key_windows_stay_pending_and_the_job_says_why() {
    let dir = tempfile::tempdir().unwrap();
    let h = harness(MemoryStore::default(), FakeLlm::new(one_idea_per_window));
    import(
        &h,
        &zip_of(
            dir.path(),
            "a.zip",
            &common::fixture_text("claude/conversations_mixed.json"),
        ),
    );

    h.worker.drain().unwrap();

    assert_eq!(
        count(
            &h.db,
            "select count(*) from extraction_windows where status = 'pending'"
        ),
        4
    );
    let last = h.sink.named(JOB_FINISHED).last().cloned().unwrap();
    assert_eq!(last["errorCode"], "no_api_key");
    assert!(h.llm.calls().is_empty());
}

#[test]
fn reimporting_an_appended_conversation_only_extracts_the_new_part() {
    let dir = tempfile::tempdir().unwrap();
    let h = harness(
        MemoryStore::with_key("sk-ant-test"),
        FakeLlm::new(one_idea_per_window),
    );
    let v1 = claude_export(&[(
        "c1".into(),
        vec![
            ("m1", "human", "First thought about decay."),
            ("m2", "assistant", "Answer."),
        ],
    )]);
    let v2 = claude_export(&[(
        "c1".into(),
        vec![
            ("m1", "human", "First thought about decay."),
            ("m2", "assistant", "Answer."),
            ("m3", "human", "A brand new follow-up idea."),
        ],
    )]);

    import(&h, &zip_of(dir.path(), "v1.zip", &v1));
    h.worker.drain().unwrap();
    import(&h, &zip_of(dir.path(), "v2.zip", &v2));
    h.worker.drain().unwrap();

    assert_eq!(
        h.llm.calls().len(),
        2,
        "one call per window, the first window is not re-sent"
    );
    assert_eq!(count(&h.db, "select count(*) from extraction_windows"), 2);
    let second = h.llm.calls()[1].messages[0]
        .content
        .as_str()
        .unwrap()
        .to_owned();
    assert!(
        second.contains("<context>"),
        "the new window carries read-only context"
    );
    assert!(second.contains("<msg i=\"0\" role=\"user\""));
    assert!(second.contains("A brand new follow-up idea."));
}
