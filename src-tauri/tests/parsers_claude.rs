mod common;

use neural_map_lib::ingest::claude;
use neural_map_lib::ingest::model::{NormalizedConversation, Role, Source};

fn parse_fixture() -> (Vec<NormalizedConversation>, Vec<String>) {
    let text = common::fixture_text("claude/conversations_mixed.json");
    let mut out = Vec::new();
    let stats = claude::parse(text.as_bytes(), |c| out.push(c)).expect("parse");
    let warnings = stats.warnings.iter().map(|w| w.to_string()).collect();
    (out, warnings)
}

fn by_id<'a>(convs: &'a [NormalizedConversation], id: &str) -> &'a NormalizedConversation {
    convs.iter().find(|c| c.source_id == id).expect(id)
}

fn texts(c: &NormalizedConversation) -> Vec<&str> {
    c.messages.iter().map(|m| m.text.as_str()).collect()
}

#[test]
fn keeps_valid_conversations_and_isolates_bad_ones() {
    let (convs, warnings) = parse_fixture();

    let ids: Vec<&str> = convs.iter().map(|c| c.source_id.as_str()).collect();
    assert_eq!(
        ids,
        [
            "c-min-0001",
            "c-tool-0002",
            "c-untitled-0003",
            "c-branch-0006"
        ]
    );
    assert!(
        warnings.iter().any(|w| w.contains("c-empty-0004")),
        "{warnings:?}"
    );
    assert!(
        warnings.iter().any(|w| w.contains("c-broken-0005")),
        "{warnings:?}"
    );
}

#[test]
fn normalizes_a_minimal_conversation() {
    let (convs, _) = parse_fixture();
    let c = by_id(&convs, "c-min-0001");

    assert_eq!(c.source, Source::Claude);
    assert_eq!(c.title, "Graph of my chats");
    assert_eq!(c.updated_marker, "2026-07-25T10:01:02.004Z");
    assert_eq!(c.url.as_deref(), Some("https://claude.ai/chat/c-min-0001"));
    assert_eq!(
        c.created_at.to_rfc3339(),
        "2026-07-25T09:38:55.311455+00:00"
    );
    assert_eq!(c.messages.len(), 2);
    assert_eq!(c.messages[0].role, Role::User);
    assert_eq!(c.messages[0].source_msg_id, "m-min-1");
    assert_eq!(c.messages[0].seq, 0);
    assert_eq!(c.messages[1].role, Role::Assistant);
    assert_eq!(c.messages[1].seq, 1);
}

#[test]
fn drops_tool_blocks_but_keeps_artifact_and_attachment_markers() {
    let (convs, _) = parse_fixture();
    let c = by_id(&convs, "c-tool-0002");

    assert_eq!(
        texts(c),
        [
            "Draft the requirements.\n\n[attachment: notes.md]",
            "[artifact: Dashboard Requirements Draft]",
            "I've drafted the requirements.",
        ]
    );
}

#[test]
fn falls_back_for_blank_titles_empty_content_and_missing_times() {
    let (convs, _) = parse_fixture();
    let c = by_id(&convs, "c-untitled-0003");

    assert_eq!(
        c.title,
        "Text-only fallback when content is empty and the title is blank so we use this l"
    );
    assert_eq!(texts(c).len(), 2, "whitespace-only message is skipped");
    assert_eq!(texts(c)[1], "Null-safe.");
    assert_eq!(c.messages[1].created_at, c.messages[0].created_at);
}

#[test]
fn walks_the_current_leaf_branch_when_present() {
    let (convs, _) = parse_fixture();
    let c = by_id(&convs, "c-branch-0006");

    let ids: Vec<&str> = c
        .messages
        .iter()
        .map(|m| m.source_msg_id.as_str())
        .collect();
    assert_eq!(ids, ["m-br-1", "m-br-3", "m-br-4"]);
    assert_eq!(
        c.messages.iter().map(|m| m.seq).collect::<Vec<_>>(),
        [0, 1, 2]
    );
}
