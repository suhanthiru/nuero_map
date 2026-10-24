use neural_map_lib::db::Db;
use neural_map_lib::error::AppError;
use neural_map_lib::ingest::detect::RequestedSource;
use neural_map_lib::jobs::queue::{self, Enqueued};
use neural_map_lib::jobs::JobPayload;

fn payload(path: &str) -> JobPayload {
    JobPayload::Import {
        path: path.into(),
        source: RequestedSource::Auto,
        expected_conversations: Some(10),
    }
}

fn created(e: Enqueued) -> i64 {
    match e {
        Enqueued::Created(id) => id,
        Enqueued::Existing(id) => panic!("expected a new job, got existing {id}"),
    }
}

fn status(db: &Db, id: i64) -> String {
    db.call_blocking(|c| Ok(queue::view(c, id)?.expect("job").status))
        .unwrap()
}

#[test]
fn claims_and_completes_a_job() {
    let db = Db::open_in_memory().unwrap();

    let id = db
        .call_blocking(|c| Ok(created(queue::enqueue(c, &payload("a.zip"), None)?)))
        .unwrap();
    let job = db
        .call_blocking(|c| queue::claim_next(c))
        .unwrap()
        .expect("job");
    let second = db.call_blocking(|c| queue::claim_next(c)).unwrap();

    assert_eq!(job.id, id);
    assert_eq!(job.root_job_id, id);
    assert_eq!(job.attempts, 1);
    assert_eq!(job.payload, payload("a.zip"));
    assert!(second.is_none(), "a running job is not claimed twice");

    db.call_blocking(|c| queue::complete(c, id, Some("{}")))
        .unwrap();
    assert_eq!(status(&db, id), "done");
    assert_eq!(
        db.call_blocking(|c| queue::open_in_pipeline(c, id))
            .unwrap(),
        0
    );
}

#[test]
fn dedupes_open_imports_but_allows_one_after_the_last_finishes() {
    let db = Db::open_in_memory().unwrap();

    db.call_blocking(|c| {
        let first = created(queue::enqueue(c, &payload("a.zip"), None)?);
        assert!(matches!(queue::enqueue(c, &payload("b.zip"), None)?, Enqueued::Existing(id) if id == first));
        queue::complete(c, first, None)?;
        let child = created(queue::enqueue(c, &payload("c.zip"), Some(first))?);
        let view = queue::view(c, child)?.expect("child");
        assert_eq!(view.root_job_id, first.to_string());
        Ok(())
    })
    .unwrap();
}

#[test]
fn retry_later_hides_the_job_until_its_backoff_elapses() {
    let db = Db::open_in_memory().unwrap();

    db.call_blocking(|c| {
        let id = created(queue::enqueue(c, &payload("a.zip"), None)?);
        queue::claim_next(c)?;
        queue::retry_later(
            c,
            id,
            &AppError::internal("flaky"),
            chrono::Duration::hours(1),
        )?;
        assert!(queue::claim_next(c)?.is_none());
        let view = queue::view(c, id)?.expect("job");
        assert_eq!(view.status, "queued");
        assert_eq!(view.error.as_deref(), Some("flaky"));
        Ok(())
    })
    .unwrap();
}

#[test]
fn failed_jobs_record_the_error_code_and_can_be_requeued() {
    let db = Db::open_in_memory().unwrap();

    db.call_blocking(|c| {
        let id = created(queue::enqueue(c, &payload("a.zip"), None)?);
        queue::claim_next(c)?;
        queue::fail(c, id, &AppError::BadExport("no conversations.json".into()))?;
        let failed = queue::view(c, id)?.expect("job");
        assert_eq!(
            (failed.status.as_str(), failed.error_code.as_deref()),
            ("failed", Some("bad_zip"))
        );

        assert!(queue::requeue(c, id)?);
        let again = queue::claim_next(c)?.expect("requeued");
        assert_eq!(again.attempts, 1, "requeue resets the attempt budget");
        Ok(())
    })
    .unwrap();
}

#[test]
fn recovery_requeues_jobs_left_running_by_a_crash() {
    let db = Db::open_in_memory().unwrap();

    db.call_blocking(|c| {
        let id = created(queue::enqueue(c, &payload("a.zip"), None)?);
        queue::claim_next(c)?;
        assert_eq!(queue::recover_running(c)?, 1);
        assert_eq!(queue::claim_next(c)?.map(|j| j.id), Some(id));
        Ok(())
    })
    .unwrap();
}

#[test]
fn only_open_jobs_can_be_cancelled() {
    let db = Db::open_in_memory().unwrap();

    db.call_blocking(|c| {
        let id = created(queue::enqueue(c, &payload("a.zip"), None)?);
        assert!(queue::mark_cancelled(c, id)?);
        assert!(!queue::mark_cancelled(c, id)?);
        assert!(queue::claim_next(c)?.is_none());
        assert_eq!(queue::recent(c, 5)?.len(), 1);
        Ok(())
    })
    .unwrap();
}

fn times(db: &Db, id: i64) -> (String, String) {
    db.call_blocking(|c| {
        Ok(c.query_row(
            "select run_after, created_at from jobs where id = ?1",
            [id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )?)
    })
    .unwrap()
}

fn set_times(db: &Db, id: i64, run_after: chrono::DateTime<chrono::Utc>, created: chrono::DateTime<chrono::Utc>) {
    db.call_blocking(|c| {
        c.execute(
            "update jobs set run_after = ?2, created_at = ?3 where id = ?1",
            rusqlite::params![id, neural_map_lib::db::ts(run_after), neural_map_lib::db::ts(created)],
        )?;
        Ok(())
    })
    .unwrap();
}

fn debounce(db: &Db) -> Enqueued {
    db.call_blocking(|c| {
        queue::enqueue_debounced(
            c,
            &JobPayload::Capture,
            chrono::Duration::minutes(5),
            chrono::Duration::minutes(20),
        )
    })
    .unwrap()
}

fn parse(value: &str) -> chrono::DateTime<chrono::Utc> {
    chrono::DateTime::parse_from_rfc3339(value).unwrap().with_timezone(&chrono::Utc)
}

#[test]
fn debounce_queues_a_delayed_job_then_pushes_it_back() {
    let db = Db::open_in_memory().unwrap();
    let now = chrono::Utc::now();

    let id = created(debounce(&db));
    let (first, _) = times(&db, id);
    assert!(parse(&first) > now + chrono::Duration::minutes(4), "runs later, not now");
    assert!(db.call_blocking(|c| queue::claim_next(c)).unwrap().is_none());

    // As if the job was queued 3 minutes ago and is due in 2.
    set_times(&db, id, now + chrono::Duration::minutes(2), now - chrono::Duration::minutes(3));
    assert!(matches!(debounce(&db), Enqueued::Existing(e) if e == id));
    let (bumped, _) = times(&db, id);
    assert!(parse(&bumped) > now + chrono::Duration::minutes(4), "pushed back to now + 5 min");
}

#[test]
fn debounce_never_waits_past_max_wait_or_moves_a_job_earlier() {
    let db = Db::open_in_memory().unwrap();
    let now = chrono::Utc::now();
    let id = created(debounce(&db));

    // Queued 18 minutes ago: the cap (created + 20 min) wins over now + 5 min.
    let queued_at = now - chrono::Duration::minutes(18);
    set_times(&db, id, now + chrono::Duration::minutes(1), queued_at);
    debounce(&db);
    let (capped, _) = times(&db, id);
    let cap = queued_at + chrono::Duration::minutes(20);
    assert!((parse(&capped) - cap).num_seconds().abs() <= 1, "capped at max_wait");

    // Already due later than now + 5 min: left alone.
    let later = now + chrono::Duration::minutes(10);
    set_times(&db, id, later, now);
    debounce(&db);
    assert_eq!(parse(&times(&db, id).0), parse(&neural_map_lib::db::ts(later)));
}

#[test]
fn debounce_leaves_a_running_job_alone_and_queues_none_beside_it() {
    let db = Db::open_in_memory().unwrap();
    let now = chrono::Utc::now();
    let id = created(debounce(&db));
    set_times(&db, id, now - chrono::Duration::seconds(1), now - chrono::Duration::minutes(5));
    db.call_blocking(|c| queue::claim_next(c)).unwrap().expect("due");

    assert!(matches!(debounce(&db), Enqueued::Existing(e) if e == id));
    let open: i64 = db
        .call_blocking(|c| Ok(c.query_row("select count(*) from jobs", [], |r| r.get(0))?))
        .unwrap();
    assert_eq!(open, 1);
    assert_eq!(status(&db, id), "running");
}

#[test]
fn views_carry_the_pipeline_root_kind() {
    let db = Db::open_in_memory().unwrap();

    db.call_blocking(|c| {
        let root = created(queue::enqueue(c, &JobPayload::Capture, None)?);
        let child = created(queue::enqueue(c, &JobPayload::Extract, Some(root))?);
        let view = queue::view(c, child)?.expect("child");
        assert_eq!((view.kind.as_str(), view.root_kind.as_str()), ("extract", "capture"));
        assert_eq!(queue::root_kind(c, root)?.as_deref(), Some("capture"));
        Ok(())
    })
    .unwrap();
}
