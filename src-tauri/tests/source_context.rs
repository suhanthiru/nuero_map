mod common;

use neural_map_lib::commands::source::load_source_context;
use neural_map_lib::db::Db;
use neural_map_lib::ingest::detect::RequestedSource;
use neural_map_lib::ingest::import::import_export;

fn message_id(db: &Db, source_msg_id: &'static str) -> i64 {
    db.call_blocking(move |c| {
        Ok(c.query_row(
            "select id from messages where source_msg_id = ?1",
            [source_msg_id],
            |r| r.get(0),
        )?)
    })
    .unwrap()
}

fn imported_db() -> Db {
    let dir = tempfile::tempdir().unwrap();
    std::fs::write(
        dir.path().join("conversations.json"),
        common::fixture_text("claude/conversations_mixed.json"),
    )
    .unwrap();
    std::fs::write(dir.path().join("users.json"), "[]").unwrap();
    let db = Db::open_in_memory().unwrap();
    import_export(&db, dir.path(), RequestedSource::Auto).unwrap();
    db
}

#[test]
fn returns_the_focus_message_with_surrounding_turns() {
    let db = imported_db();
    let focus = message_id(&db, "m-tool-2");

    let ctx = load_source_context(&db, focus, 1).unwrap();

    assert_eq!(ctx.app, "claude");
    assert_eq!(ctx.conversation_title, "Requirements draft");
    assert_eq!(
        ctx.conversation_url.as_deref(),
        Some("https://claude.ai/chat/c-tool-0002")
    );
    assert_eq!(ctx.focus_message_id, focus.to_string());
    let speakers: Vec<&str> = ctx.messages.iter().map(|m| m.speaker.as_str()).collect();
    assert_eq!(speakers, ["user", "assistant", "assistant"]);
    assert_eq!(
        ctx.messages[1].text,
        "[artifact: Dashboard Requirements Draft]"
    );
}

#[test]
fn clamps_the_window_at_conversation_edges() {
    let db = imported_db();

    let ctx = load_source_context(&db, message_id(&db, "m-min-1"), 3).unwrap();

    assert_eq!(ctx.messages.len(), 2);
}

#[test]
fn unknown_message_is_not_found() {
    let db = imported_db();

    let err = load_source_context(&db, 999_999, 2).unwrap_err();

    assert_eq!(err.code(), "not_found");
}
