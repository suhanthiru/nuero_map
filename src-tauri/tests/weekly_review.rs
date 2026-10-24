use std::sync::Arc;

use chrono::{NaiveDate, Utc};
use neural_map_lib::db::repo::reviews;
use neural_map_lib::db::Db;
use neural_map_lib::embed::fake::FakeEmbedder;
use neural_map_lib::error::{AppError, AppResult};
use neural_map_lib::events::RecordingSink;
use neural_map_lib::jobs::handlers::JobContext;
use neural_map_lib::jobs::worker::Worker;
use neural_map_lib::jobs::JobHandle;
use neural_map_lib::llm::fake::FakeLlm;
use neural_map_lib::llm::types::MessageRequest;
use neural_map_lib::review::{dto, flow};
use neural_map_lib::secrets::MemoryStore;
use rusqlite::{params, Connection};
use serde_json::json;

const MONDAY: &str = "2026-10-12";

fn monday() -> NaiveDate {
    NaiveDate::parse_from_str(MONDAY, "%Y-%m-%d").unwrap()
}

/// One conversation with a message per idea; topics by name.
fn seed(conn: &Connection, ideas: &[(&str, &str, &str, &str)]) {
    let at = "2026-10-14T10:00:00.000000Z";
    conn.execute(
        "insert into conversations (source, source_conv_id, title, created_at, updated_at, updated_marker, content_hash, imported_at)
         values ('claude', 'c1', 'Week chat', ?1, ?1, ?1, 'h', ?1)",
        [at],
    )
    .unwrap();
    conn.execute(
        "insert into extraction_windows (conversation_id, window_index, first_seq, last_seq, window_hash, created_at, updated_at)
         values (1, 0, 0, 99, 'w', ?1, ?1)",
        [at],
    )
    .unwrap();
    for (i, (topic, kind, title, day)) in ideas.iter().enumerate() {
        let topic_id: i64 =
            match conn.query_row("select id from topics where name = ?1", [topic], |r| {
                r.get(0)
            }) {
                Ok(id) => id,
                Err(_) => {
                    conn.execute(
                        "insert into topics (name, created_at, updated_at) values (?1, ?2, ?2)",
                        params![topic, at],
                    )
                    .unwrap();
                    conn.last_insert_rowid()
                }
            };
        let when = format!("{day}T10:00:00.000000Z");
        let quote = format!("{title}, as the assistant explained it.");
        conn.execute(
            "insert into messages (conversation_id, source_msg_id, seq, role, text, created_at)
             values (1, ?1, ?2, 'assistant', ?3, ?4)",
            params![format!("m{i}"), i as i64, quote, when],
        )
        .unwrap();
        let message_id = conn.last_insert_rowid();
        conn.execute(
            "insert into ideas (conversation_id, window_id, idea_index, title, summary, kind, topic_label, excerpt,
                                excerpt_verified, is_user_originated, gem_candidate, first_message_at, topic_id, created_at)
             values (1, 1, ?1, ?2, ?3, ?4, ?5, ?6, 1, 0, 0, ?7, ?8, ?7)",
            params![i as i64, title, format!("Summary of {title}"), kind, topic, quote, when, topic_id],
        )
        .unwrap();
        let idea_id = conn.last_insert_rowid();
        conn.execute(
            "insert into idea_messages (idea_id, message_id) values (?1, ?2)",
            params![idea_id, message_id],
        )
        .unwrap();
    }
}

fn week_of_ideas() -> Vec<(&'static str, &'static str, &'static str, &'static str)> {
    vec![
        ("Rust async", "fact", "Futures are lazy", "2026-10-12"),
        (
            "Rust async",
            "insight",
            "Pin keeps self-references valid",
            "2026-10-13",
        ),
        (
            "Rust async",
            "fact",
            "Tokio uses work stealing",
            "2026-10-14",
        ),
        (
            "Sleep",
            "insight",
            "Light in the morning anchors the rhythm",
            "2026-10-15",
        ),
        ("Sleep", "decision", "No screens after ten", "2026-10-16"),
        ("Sleep", "preference", "I like cold rooms", "2026-10-16"),
        ("Rust async", "fact", "Last week's idea", "2026-10-05"),
    ]
}

fn idea_ids(text: &str) -> Vec<i64> {
    text.split("<idea id=\"")
        .skip(1)
        .filter_map(|s| s.split('"').next()?.parse().ok())
        .collect()
}

/// Writes one multiple-choice question per idea (answer always "B") and one free
/// response; grades every free response as one met, one partial.
fn responder(req: &MessageRequest) -> AppResult<String> {
    let user = req.messages[0].content.as_str().unwrap_or_default();
    if req.system[0].text.starts_with("You write") {
        let ids = idea_ids(user);
        let mut questions: Vec<_> = ids
            .iter()
            .map(|id| json!({"kind": "mcq", "difficulty": "recall", "prompt": format!("About idea {id}?"),
                             "choices": ["A", "B", "C", "D"], "answer_index": 1, "explanation": "B is right.",
                             "key_points": [], "source_ids": [id]}))
            .collect();
        questions.push(
            json!({"kind": "frq", "difficulty": "understand", "prompt": "Explain pinning.",
                              "choices": [], "answer_index": -1, "explanation": "Model answer.",
                              "key_points": ["self-references", "moves"], "source_ids": [ids[1]]}),
        );
        return Ok(json!({ "questions": questions }).to_string());
    }
    let seq: i64 = user
        .split("kind=\"frq\"")
        .next()
        .and_then(|before| before.rsplit("<question seq=\"").next())
        .and_then(|s| s.split('"').next())
        .and_then(|s| s.parse().ok())
        .unwrap_or(0);
    Ok(json!({
        "frq_grades": [{"seq": seq, "key_points": ["met", "partial"], "feedback": "You got the first point."}],
        "guide": {
            "overview": "Async stuck; sleep didn't.", "strengths": ["Futures are lazy"],
            "sections": [{"topic": "Sleep", "priority": "review_now", "why": "Missed the light question.",
                          "key_ideas": ["Morning light anchors the circadian rhythm."], "misconception": "",
                          "practice": ["Why does morning light matter?"], "source_ids": idea_ids(user).into_iter().take(1).collect::<Vec<_>>(),
                          "question_seqs": [1]}],
            "next_steps": ["Retest on Friday."]
        }
    })
    .to_string())
}

fn worker_with(db: &Db, llm: Arc<FakeLlm>) -> Worker {
    let ctx = JobContext {
        db: db.clone(),
        sink: Arc::new(RecordingSink::default()),
        llm,
        keys: Arc::new(MemoryStore::with_key("sk-ant-test")),
        embedder: Arc::new(FakeEmbedder),
    };
    Worker::new(ctx, JobHandle::default())
}

fn declining() -> Arc<FakeLlm> {
    Arc::new(FakeLlm::new(|_| Err(AppError::Refused("cyber".into()))))
}

fn setup() -> (Db, Worker, Arc<FakeLlm>) {
    let db = Db::open_in_memory().unwrap();
    db.call_blocking(|c| {
        seed(c, &week_of_ideas());
        Ok(())
    })
    .unwrap();
    let llm = Arc::new(FakeLlm::new(responder));
    let worker = worker_with(&db, llm.clone());
    (db, worker, llm)
}

fn start(db: &Db) -> i64 {
    db.call_blocking(|c| flow::start(c, &Utc, monday(), "claude-opus-5-5"))
        .unwrap()
}

#[test]
fn a_week_becomes_a_test_then_a_graded_study_guide() {
    let (db, worker, llm) = setup();

    let weeks = db
        .call_blocking(|c| dto::weeks(c, &Utc, NaiveDate::from_ymd_opt(2026, 10, 20).unwrap(), 3))
        .unwrap();
    assert_eq!(weeks[1].week_of, MONDAY);
    assert_eq!(
        (weeks[1].idea_count, weeks[1].topic_count),
        (5, 2),
        "preferences and other weeks are left out"
    );
    assert!(weeks[1].can_review);
    assert!(!weeks[0].can_review, "the current week has nothing yet");

    let id = start(&db);
    worker.drain().unwrap();

    let review = db.call_blocking(|c| dto::review(c, id)).unwrap();
    assert_eq!(review.status, "ready");
    assert_eq!(
        review.questions.len(),
        5,
        "4 multiple choice (5 ideas ask for 4) + 1 written"
    );
    assert!(
        review
            .questions
            .iter()
            .all(|q| q.answer_index.is_none() && q.sources.is_empty()),
        "answers hidden before grading"
    );
    let request = &llm.calls()[0];
    assert!(request.system[0].text.starts_with("You write"));
    assert_eq!(request.fallbacks, Some("default"));

    for q in &review.questions {
        let answer = match q.kind.as_str() {
            "mcq" => Some("1".to_owned()),
            _ => Some("Pinning stops a future from moving.".to_owned()),
        };
        db.call_blocking(|c| flow::save_answer(c, id, q.id.parse().unwrap(), answer))
            .unwrap();
    }
    let bad = db.call_blocking(|c| {
        flow::save_answer(
            c,
            id,
            review.questions[0].id.parse().unwrap(),
            Some("7".into()),
        )
    });
    assert_eq!(bad.unwrap_err().code(), "invalid_input");

    // The submit carries the answers as last seen, overriding what autosave stored:
    // question 1 changes to a wrong option.
    let changed = (
        review.questions[0].id.parse().unwrap(),
        Some("0".to_owned()),
    );
    db.call_blocking(|c| flow::submit(c, id, &[changed]))
        .unwrap();
    let locked = db
        .call_blocking(|c| flow::save_answer(c, id, review.questions[1].id.parse().unwrap(), None));
    assert_eq!(
        locked.unwrap_err().code(),
        "invalid_input",
        "answers lock on submit"
    );
    worker.drain().unwrap();

    let graded = db.call_blocking(|c| dto::review(c, id)).unwrap();
    assert_eq!(graded.status, "graded");
    // 3 of 4 multiple choice + 1.5 of 2 written = 4.5 of 6.
    assert!((graded.score.unwrap() - 4.5 / 6.0).abs() < 1e-6);
    let first = &graded.questions[0];
    assert_eq!((first.answer_index, first.points), (Some(1), Some(0.0)));
    assert_eq!(first.sources.len(), 1);
    assert!(first.sources[0]
        .excerpt
        .text
        .contains("as the assistant explained it"));
    let written = graded.questions.iter().find(|q| q.kind == "frq").unwrap();
    assert_eq!(written.points, Some(1.5));
    let verdicts: Vec<_> = written
        .key_points
        .iter()
        .map(|k| k.verdict.as_deref())
        .collect();
    assert_eq!(verdicts, vec![Some("met"), Some("partial")]);
    let guide = graded.guide.unwrap();
    assert_eq!(guide.sections[0].topic.as_ref().unwrap().title, "Sleep");
    assert_eq!(guide.sections[0].sources.len(), 1);
    assert_eq!(guide.next_steps, vec!["Retest on Friday."]);
}

#[test]
fn a_thin_week_is_refused_and_a_refusal_fails_the_review_with_a_reason() {
    let (db, _, _) = setup();
    let thin = db.call_blocking(|c| {
        flow::start(
            c,
            &Utc,
            monday() - chrono::Duration::weeks(1),
            "claude-opus-5-5",
        )
    });
    assert_eq!(thin.unwrap_err().code(), "invalid_input");

    let worker = worker_with(&db, declining());
    let id = start(&db);
    worker.drain().unwrap();

    let review = db.call_blocking(|c| reviews::get(c, id)).unwrap();
    assert_eq!(review.status, "failed");
    assert!(review.error.unwrap().contains("declined"));
}

#[test]
fn unfinished_reviews_are_requeued_and_failures_keep_earlier_work() {
    let (db, worker, _) = setup();
    let id = start(&db);
    // As if the app closed before the job was saved.
    db.call_blocking(|c| Ok(c.execute("delete from jobs", [])?))
        .unwrap();

    assert_eq!(db.call_blocking(flow::requeue_unfinished).unwrap(), 1);
    assert_eq!(
        db.call_blocking(flow::requeue_unfinished).unwrap(),
        0,
        "an open job is reused"
    );
    worker.drain().unwrap();
    db.call_blocking(|c| flow::submit(c, id, &[])).unwrap();

    // Grading that Claude declines reopens the test with the answers kept.
    worker_with(&db, declining()).drain().unwrap();
    let reopened = db.call_blocking(|c| reviews::get(c, id)).unwrap();
    assert_eq!(reopened.status, "ready");
    assert!(reopened.error.unwrap().contains("submit again"));

    db.call_blocking(|c| flow::submit(c, id, &[])).unwrap();
    worker.drain().unwrap();
    assert_eq!(
        db.call_blocking(|c| reviews::get(c, id)).unwrap().status,
        "graded"
    );

    // A retake that fails doesn't hide the graded test.
    let retake = start(&db);
    worker_with(&db, declining()).drain().unwrap();
    assert_eq!(
        db.call_blocking(|c| reviews::get(c, retake))
            .unwrap()
            .status,
        "failed"
    );
    let latest = db
        .call_blocking(|c| reviews::latest_for_week(c, MONDAY))
        .unwrap()
        .unwrap();
    assert_eq!(latest.id, id);
}
