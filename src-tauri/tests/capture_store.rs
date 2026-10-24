use chrono::{DateTime, Utc};
use neural_map_lib::capture::merge::Turn;
use neural_map_lib::capture::payload::Capture;
use neural_map_lib::capture::store::store;
use neural_map_lib::db::repo::windows;
use neural_map_lib::db::Db;
use neural_map_lib::extract::plan::plan_pending;
use neural_map_lib::ingest::model::Role;

fn at(secs: i64) -> DateTime<Utc> {
    DateTime::from_timestamp(1_800_000_000 + secs, 0).unwrap()
}

fn capture(texts: &[&str], title: Option<&str>) -> Capture {
    Capture {
        source_id: "chat1".into(),
        url: "https://gemini.google.com/app/chat1".into(),
        title: title.map(str::to_owned),
        from_start: false,
        turns: texts
            .iter()
            .enumerate()
            .map(|(i, t)| Turn {
                role: if i % 2 == 0 { Role::User } else { Role::Assistant },
                text: (*t).to_owned(),
                captured_at: at(i as i64),
            })
            .collect(),
    }
}

fn put(db: &Db, c: &Capture) -> neural_map_lib::capture::store::Stored {
    db.call_blocking(|conn| store(conn, c, at(1_000))).unwrap()
}

fn one(db: &Db, sql: &str) -> String {
    let sql = sql.to_owned();
    db.call_blocking(move |c| Ok(c.query_row(&sql, [], |r| r.get::<_, rusqlite::types::Value>(0))?))
        .map(|v| match v {
            rusqlite::types::Value::Integer(i) => i.to_string(),
            rusqlite::types::Value::Text(t) => t,
            other => format!("{other:?}"),
        })
        .unwrap()
}

/// (index, id, hash) of each window after planning.
fn plan(db: &Db, conversation_id: i64) -> Vec<(i64, i64, String)> {
    db.call_blocking(|c| {
        plan_pending(c)?;
        Ok(windows::for_conversation(c, conversation_id)?
            .into_iter()
            .map(|w| (w.window_index, w.id, w.as_existing().hash))
            .collect())
    })
    .unwrap()
}

/// Long enough that each turn fills its own extraction window.
fn big(tag: &str) -> String {
    format!("{tag} {}", "word ".repeat(10_000))
}

#[test]
fn a_first_capture_stores_a_gemini_chat_and_queues_one_debounced_job() {
    let db = Db::open_in_memory().unwrap();

    let s = put(&db, &capture(&["why sky blue", "rayleigh"], Some("Sky")));

    assert!(s.changed && s.new_turns == 2);
    assert_eq!(one(&db, "select source || '|' || title || '|' || url from conversations"),
        "gemini|Sky|https://gemini.google.com/app/chat1");
    assert_eq!(one(&db, "select count(*) from messages where time_source = 'capture'"), "2");
    assert_eq!(one(&db, "select kind || '|' || status from jobs"), "capture|queued");
    assert!(one(&db, "select run_after from jobs") > neural_map_lib::db::now_ts(), "debounced");
}

#[test]
fn resending_the_same_snapshot_writes_nothing() {
    let db = Db::open_in_memory().unwrap();
    put(&db, &capture(&["q", "a"], Some("T")));
    let before = one(&db, "select imported_at || run_after from conversations, jobs");

    let s = put(&db, &capture(&["q", "a"], Some("T")));

    assert!(!s.changed);
    assert_eq!(one(&db, "select imported_at || run_after from conversations, jobs"), before);
}

#[test]
fn without_a_title_the_stored_one_is_kept_and_a_rename_keeps_the_hash() {
    let db = Db::open_in_memory().unwrap();
    put(&db, &capture(&["plan the trip", "ok"], None));
    assert_eq!(one(&db, "select title from conversations"), "plan the trip");
    let hash = one(&db, "select content_hash from conversations");

    let renamed = put(&db, &capture(&["plan the trip", "ok"], Some("Lisbon trip")));
    let untitled = put(&db, &capture(&["plan the trip", "ok"], None));

    assert!(renamed.changed && !untitled.changed);
    assert_eq!(one(&db, "select title from conversations"), "Lisbon trip");
    assert_eq!(one(&db, "select content_hash from conversations"), hash);
    assert_eq!(one(&db, "select count(*) from jobs"), "1", "a rename alone queues nothing new");
}

#[test]
fn recapturing_keeps_message_times_and_appending_keeps_earlier_windows() {
    let db = Db::open_in_memory().unwrap();
    let (q1, a1) = (big("q1"), big("a1"));
    let id = put(&db, &capture(&[&q1, &a1], None)).conversation_id.unwrap();
    let first_windows = plan(&db, id);
    let first_time = one(&db, "select created_at from messages order by seq limit 1");

    let (q2, a2) = (big("q2"), big("a2"));
    let mut later = capture(&[&q1, &a1, &q2, &a2], None);
    for t in &mut later.turns {
        t.captured_at = at(500);
    }
    put(&db, &later);

    let windows = plan(&db, id);
    assert_eq!(&windows[..first_windows.len()], &first_windows[..], "kept windows");
    assert!(windows.len() > first_windows.len());
    assert_eq!(one(&db, "select created_at from messages order by seq limit 1"), first_time);
}

#[test]
fn a_regenerated_reply_retires_only_its_window() {
    let db = Db::open_in_memory().unwrap();
    let texts = [big("q1"), big("a1"), big("q2"), big("a2")];
    let refs: Vec<&str> = texts.iter().map(String::as_str).collect();
    let id = put(&db, &capture(&refs, None)).conversation_id.unwrap();
    let before = plan(&db, id);

    let again = big("a2 regenerated");
    let s = put(&db, &capture(&[refs[0], refs[1], refs[2], &again], None));

    assert!(s.branch_changed);
    let after = plan(&db, id);
    assert_eq!(&after[..before.len() - 1], &before[..before.len() - 1]);
    assert_ne!(after.last().map(|w| &w.2), before.last().map(|w| &w.2), "last window replanned");
    assert_eq!(one(&db, "select count(*) from messages where superseded = 1"), "1");
}

#[test]
fn older_turns_that_load_later_get_head_windows_and_keep_the_rest() {
    let db = Db::open_in_memory().unwrap();
    let texts = [big("t1"), big("t2"), big("t3"), big("t4")];
    let refs: Vec<&str> = texts.iter().map(String::as_str).collect();
    let id = put(&db, &capture(&refs[2..], None)).conversation_id.unwrap();
    let before = plan(&db, id);

    put(&db, &capture(&refs, None));

    let after = plan(&db, id);
    assert_eq!(&after[after.len() - before.len()..], &before[..], "existing windows kept");
    assert!(after.len() > before.len());
    assert!(after[0].0 < before[0].0, "head windows sort first");
    assert_eq!(
        one(&db, "select count(*) from extraction_windows where status = 'pending'"),
        after.len().to_string(),
        "nothing was extracted yet, so all are pending"
    );
}
