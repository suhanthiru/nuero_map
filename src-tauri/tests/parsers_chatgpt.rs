mod common;

use neural_map_lib::ingest::chatgpt;
use neural_map_lib::ingest::model::{NormalizedConversation, Role, Source};

fn parse_fixture() -> (Vec<NormalizedConversation>, Vec<String>) {
    let text = common::fixture_text("chatgpt/conversations_mixed.json");
    let mut out = Vec::new();
    let stats = chatgpt::parse(text.as_bytes(), |c| out.push(c)).expect("parse");
    let warnings = stats.warnings.iter().map(|w| w.to_string()).collect();
    (out, warnings)
}

fn by_id<'a>(convs: &'a [NormalizedConversation], id: &str) -> &'a NormalizedConversation {
    convs.iter().find(|c| c.source_id == id).expect(id)
}

fn ids(c: &NormalizedConversation) -> Vec<&str> {
    c.messages
        .iter()
        .map(|m| m.source_msg_id.as_str())
        .collect()
}

#[test]
fn keeps_valid_conversations_and_isolates_bad_ones() {
    let (convs, warnings) = parse_fixture();

    let got: Vec<&str> = convs.iter().map(|c| c.source_id.as_str()).collect();
    assert_eq!(
        got,
        [
            "g-linear-01",
            "g-branch-02",
            "g-tools-03",
            "g-multi-04",
            "g-cycle-05",
            "g-loop-06"
        ]
    );
    assert!(
        warnings.iter().any(|w| w.contains("g-bad-07")),
        "{warnings:?}"
    );
}

#[test]
fn normalizes_a_linear_conversation_and_skips_hidden_system_nodes() {
    let (convs, _) = parse_fixture();
    let c = by_id(&convs, "g-linear-01");

    assert_eq!(c.source, Source::ChatGpt);
    assert_eq!(c.title, "Rust streaming JSON");
    assert_eq!(c.updated_marker, "1724003600.5");
    assert_eq!(c.url.as_deref(), Some("https://chatgpt.com/c/g-linear-01"));
    assert_eq!(ids(c), ["n2", "n3"]);
    assert_eq!(c.messages[0].role, Role::User);
    assert_eq!(c.messages[1].role, Role::Assistant);
    assert_eq!(
        c.messages[1].created_at.timestamp_micros(),
        1_724_000_010_250_000
    );
}

#[test]
fn follows_current_node_through_regenerated_branches() {
    let (convs, _) = parse_fixture();

    assert_eq!(ids(by_id(&convs, "g-branch-02")), ["b1", "b3", "b4"]);
}

#[test]
fn skips_tool_calls_context_reasoning_and_canvas_but_keeps_in_progress_text() {
    let (convs, _) = parse_fixture();
    let c = by_id(&convs, "g-tools-03");

    assert_eq!(ids(c), ["t2", "t8"]);
    assert_eq!(
        c.title,
        "Plot the decay curve with a 14 day half-life and compare it to my usage."
    );
    // t8 has a null create_time: it inherits the previous kept message's time.
    assert_eq!(c.messages[1].created_at, c.messages[0].created_at);
}

#[test]
fn maps_multimodal_parts_to_text_and_placeholders() {
    let (convs, _) = parse_fixture();
    let c = by_id(&convs, "g-multi-04");

    let texts: Vec<&str> = c.messages.iter().map(|m| m.text.as_str()).collect();
    assert_eq!(
        texts,
        [
            "[image]\nWhat is this servo?",
            "Also, why does it jitter?",
            "It is an SG90; jitter is usually power."
        ]
    );
}

#[test]
fn falls_back_to_newest_child_when_current_node_is_missing() {
    let (convs, _) = parse_fixture();
    let c = by_id(&convs, "g-cycle-05");

    assert_eq!(ids(c), ["x1", "x3"]);
    assert_eq!(c.title, "Which branch wins without current_node?");
}

#[test]
fn survives_parent_cycles() {
    let (convs, _) = parse_fixture();

    assert_eq!(ids(by_id(&convs, "g-loop-06")), ["l1", "l2"]);
}
