mod common;

use neural_map_lib::db::Db;
use neural_map_lib::ingest::detect::RequestedSource;
use neural_map_lib::ingest::import::{estimate_export, import_export};

fn claude_zip(dir: &std::path::Path, body: &str) -> std::path::PathBuf {
    common::make_zip(
        dir,
        "claude.zip",
        &[("conversations.json", body), ("users.json", "[]")],
    )
}

fn count(db: &Db, sql: &str) -> i64 {
    db.call_blocking(move |c| Ok(c.query_row(sql, [], |r| r.get(0))?))
        .unwrap()
}

#[test]
fn first_import_inserts_everything_and_reimport_is_a_no_op() {
    let dir = tempfile::tempdir().unwrap();
    let zip = claude_zip(
        dir.path(),
        &common::fixture_text("claude/conversations_mixed.json"),
    );
    let db = Db::open_in_memory().unwrap();

    let first = import_export(&db, &zip, RequestedSource::Auto).unwrap();
    let second = import_export(&db, &zip, RequestedSource::Auto).unwrap();

    assert_eq!(first.new_conversations, 4);
    assert_eq!(first.messages_added, 10);
    assert_eq!(first.warnings.len(), 2);
    assert_eq!(second.new_conversations, 0);
    assert_eq!(second.unchanged_conversations, 4);
    assert_eq!(second.messages_added, 0);
    assert_eq!(count(&db, "select count(*) from conversations"), 4);
    assert_eq!(count(&db, "select count(*) from messages"), 10);
}

#[test]
fn a_changed_conversation_only_adds_its_new_messages() {
    let dir = tempfile::tempdir().unwrap();
    let db = Db::open_in_memory().unwrap();
    let v1 = r#"[{"uuid":"c1","name":"t","created_at":"2026-01-01T00:00:00Z","updated_at":"2026-01-01T00:00:00Z",
        "chat_messages":[{"uuid":"m1","sender":"human","text":"hello","created_at":"2026-01-01T00:00:00Z"}]}]"#;
    let v2 = r#"[{"uuid":"c1","name":"t","created_at":"2026-01-01T00:00:00Z","updated_at":"2026-01-02T00:00:00Z",
        "chat_messages":[{"uuid":"m1","sender":"human","text":"hello","created_at":"2026-01-01T00:00:00Z"},
                         {"uuid":"m2","sender":"assistant","text":"hi back","created_at":"2026-01-02T00:00:00Z"}]}]"#;

    import_export(&db, &claude_zip(dir.path(), v1), RequestedSource::Auto).unwrap();
    let report = import_export(&db, &claude_zip(dir.path(), v2), RequestedSource::Auto).unwrap();

    assert_eq!(report.changed_conversations, 1);
    assert_eq!(report.messages_added, 1);
    assert_eq!(count(&db, "select count(*) from messages"), 2);
}

#[test]
fn switching_chatgpt_branches_marks_old_messages_superseded() {
    let dir = tempfile::tempdir().unwrap();
    let db = Db::open_in_memory().unwrap();
    let conv = |current: &str, update: u32| {
        format!(
            r#"[{{"id":"g1","title":"t","create_time":1,"update_time":{update},"current_node":"{current}","mapping":{{
            "r":{{"id":"r","message":null,"parent":null,"children":["u"]}},
            "u":{{"id":"u","parent":"r","children":["a","b"],"message":{{"id":"u","author":{{"role":"user"}},"create_time":2,"content":{{"content_type":"text","parts":["q"]}},"recipient":"all"}}}},
            "a":{{"id":"a","parent":"u","children":[],"message":{{"id":"a","author":{{"role":"assistant"}},"create_time":3,"content":{{"content_type":"text","parts":["old"]}},"recipient":"all"}}}},
            "b":{{"id":"b","parent":"u","children":[],"message":{{"id":"b","author":{{"role":"assistant"}},"create_time":4,"content":{{"content_type":"text","parts":["new"]}},"recipient":"all"}}}}}}}}]"#
        )
    };
    let zip = |body: String, name: &str| {
        common::make_zip(
            dir.path(),
            name,
            &[("conversations.json", &body), ("chat.html", "")],
        )
    };

    import_export(&db, &zip(conv("a", 10), "v1.zip"), RequestedSource::Auto).unwrap();
    import_export(&db, &zip(conv("b", 20), "v2.zip"), RequestedSource::Auto).unwrap();

    assert_eq!(
        count(&db, "select count(*) from messages where superseded = 1"),
        1
    );
    assert_eq!(
        count(
            &db,
            "select seq from messages where source_msg_id = 'b' and superseded = 0"
        ),
        1
    );
}

#[test]
fn estimate_counts_only_new_or_changed_work_and_writes_nothing() {
    let dir = tempfile::tempdir().unwrap();
    let zip = claude_zip(
        dir.path(),
        &common::fixture_text("claude/conversations_mixed.json"),
    );
    let db = Db::open_in_memory().unwrap();

    let before = estimate_export(&db, &zip, RequestedSource::Auto).unwrap();
    import_export(&db, &zip, RequestedSource::Auto).unwrap();
    let after = estimate_export(&db, &zip, RequestedSource::Auto).unwrap();

    assert_eq!(before.conversations, 4);
    assert_eq!(before.new_conversations, 4);
    assert_eq!(before.messages, 10);
    assert!(before.estimated_input_tokens > 0);
    assert!(before.estimated_cost_usd > 0.0);
    assert_eq!(after.new_conversations, 0);
    assert_eq!(after.estimated_input_tokens, 0);
}

struct StopImmediately;

impl neural_map_lib::ingest::import::ImportObserver for StopImmediately {
    fn stored(&self, _: usize) {}
    fn should_stop(&self) -> bool {
        true
    }
}

#[test]
fn cancelling_stops_parsing_and_stores_nothing_from_the_open_batch() {
    let dir = tempfile::tempdir().unwrap();
    let zip = claude_zip(
        dir.path(),
        &common::fixture_text("claude/conversations_mixed.json"),
    );
    let db = Db::open_in_memory().unwrap();

    let err = neural_map_lib::ingest::import::import_export_observed(
        &db,
        &zip,
        RequestedSource::Auto,
        &StopImmediately,
    )
    .unwrap_err();

    assert_eq!(err.code(), "cancelled");
    assert_eq!(count(&db, "select count(*) from conversations"), 0);
}
