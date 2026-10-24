mod common;

use neural_map_lib::error::AppError;
use neural_map_lib::ingest::archive::Archive;
use neural_map_lib::ingest::detect::{detect, ExportKind, RequestedSource};

const CLAUDE_BODY: &str = r#"[{"uuid":"c1","chat_messages":[]}]"#;
const CHATGPT_BODY: &str = r#"[{"id":"g1","mapping":{}}]"#;

#[test]
fn detects_a_claude_export_by_its_marker_files() {
    let dir = tempfile::tempdir().unwrap();
    let zip = common::make_zip(
        dir.path(),
        "claude.zip",
        &[("conversations.json", CLAUDE_BODY), ("users.json", "[]")],
    );

    let found = detect(&Archive::open(&zip).unwrap(), RequestedSource::Auto).unwrap();

    assert_eq!(found.kind, ExportKind::Claude);
    assert_eq!(found.conversation_files, ["conversations.json"]);
}

#[test]
fn detects_a_chatgpt_export_inside_a_top_level_folder() {
    let dir = tempfile::tempdir().unwrap();
    let zip = common::make_zip(
        dir.path(),
        "gpt.zip",
        &[
            ("export-2026/conversations.json", CHATGPT_BODY),
            ("export-2026/chat.html", "<html></html>"),
        ],
    );

    let found = detect(&Archive::open(&zip).unwrap(), RequestedSource::Auto).unwrap();

    assert_eq!(found.kind, ExportKind::ChatGpt);
    assert_eq!(found.conversation_files, ["export-2026/conversations.json"]);
}

#[test]
fn orders_sharded_chatgpt_v2_conversation_files() {
    let dir = tempfile::tempdir().unwrap();
    let zip = common::make_zip(
        dir.path(),
        "gpt2.zip",
        &[
            ("conversations-001.json", CHATGPT_BODY),
            ("export_manifest.json", "{}"),
            ("conversations-000.json", CHATGPT_BODY),
        ],
    );

    let found = detect(&Archive::open(&zip).unwrap(), RequestedSource::Auto).unwrap();

    assert_eq!(found.kind, ExportKind::ChatGpt);
    assert_eq!(
        found.conversation_files,
        ["conversations-000.json", "conversations-001.json"]
    );
}

#[test]
fn sniffs_the_shape_when_marker_files_are_missing() {
    let dir = tempfile::tempdir().unwrap();
    let claude = common::make_zip(dir.path(), "a.zip", &[("conversations.json", CLAUDE_BODY)]);
    let gpt = common::make_zip(dir.path(), "b.zip", &[("conversations.json", CHATGPT_BODY)]);

    let a = detect(&Archive::open(&claude).unwrap(), RequestedSource::Auto).unwrap();
    let b = detect(&Archive::open(&gpt).unwrap(), RequestedSource::Auto).unwrap();

    assert_eq!(a.kind, ExportKind::Claude);
    assert_eq!(b.kind, ExportKind::ChatGpt);
}

#[test]
fn rejects_a_zip_without_conversations() {
    let dir = tempfile::tempdir().unwrap();
    let zip = common::make_zip(dir.path(), "x.zip", &[("readme.txt", "hi")]);

    let err = detect(&Archive::open(&zip).unwrap(), RequestedSource::Auto).unwrap_err();

    assert_eq!(err.code(), "bad_zip");
}

#[test]
fn rejects_a_source_mismatch() {
    let dir = tempfile::tempdir().unwrap();
    let zip = common::make_zip(
        dir.path(),
        "claude.zip",
        &[("conversations.json", CLAUDE_BODY), ("users.json", "[]")],
    );

    let err = detect(&Archive::open(&zip).unwrap(), RequestedSource::ChatGpt).unwrap_err();

    assert!(matches!(err, AppError::BadExport(_)), "{err:?}");
}

#[test]
fn reads_an_extracted_folder_and_a_bare_json_file() {
    let dir = tempfile::tempdir().unwrap();
    std::fs::write(dir.path().join("conversations.json"), CHATGPT_BODY).unwrap();
    std::fs::write(dir.path().join("chat.html"), "").unwrap();

    let folder = detect(&Archive::open(dir.path()).unwrap(), RequestedSource::Auto).unwrap();
    let file = detect(
        &Archive::open(&dir.path().join("conversations.json")).unwrap(),
        RequestedSource::Auto,
    )
    .unwrap();

    assert_eq!(folder.kind, ExportKind::ChatGpt);
    assert_eq!(file.kind, ExportKind::ChatGpt);
    assert_eq!(file.conversation_files, ["conversations.json"]);
}
