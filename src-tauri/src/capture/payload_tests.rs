use super::*;
use serde_json::json;

fn body(edit: impl FnOnce(&mut serde_json::Value)) -> AppResult<Capture> {
    let mut v = json!({
        "v": 1,
        "source": "gemini",
        "conversation": {"source_id": "abc_123-x", "title": "  Rust\n lifetimes  "},
        "turns": [
            {"role": "user", "text": "why?", "captured_at": "2026-10-22T10:00:00Z"},
            {"role": "model", "text": "because", "captured_at": "2026-10-22T10:00:05.250Z"}
        ],
        "client": {"ext_version": "0.1.0"}
    });
    edit(&mut v);
    validate(serde_json::from_value(v).map_err(AppError::from)?)
}

fn code(result: AppResult<Capture>) -> String {
    result.unwrap_err().code().to_owned()
}

#[test]
fn a_valid_body_maps_roles_builds_the_url_and_cleans_the_title() {
    let c = body(|_| {}).unwrap();

    assert_eq!(c.url, "https://gemini.google.com/app/abc_123-x");
    assert_eq!(c.title.as_deref(), Some("Rust lifetimes"));
    assert_eq!(c.turns[1].role, Role::Assistant);
    assert!(!c.from_start);
}

#[test]
fn a_gem_chat_gets_the_gem_url() {
    let c = body(|v| v["conversation"]["gem_id"] = json!("g9")).unwrap();

    assert_eq!(c.url, "https://gemini.google.com/gem/g9/abc_123-x");
}

#[test]
fn rejects_other_versions_sources_and_bad_ids() {
    assert_eq!(code(body(|v| v["v"] = json!(2))), "invalid_input");
    assert_eq!(code(body(|v| v["source"] = json!("claude"))), "invalid_input");
    assert_eq!(code(body(|v| v["conversation"]["source_id"] = json!("../x"))), "invalid_input");
    assert_eq!(code(body(|v| v["conversation"]["source_id"] = json!(""))), "invalid_input");
    assert_eq!(code(body(|v| v["conversation"]["source_id"] = json!("a".repeat(65)))), "invalid_input");
    assert_eq!(code(body(|v| v["conversation"]["gem_id"] = json!("g/9"))), "invalid_input");
}

#[test]
fn caps_turn_count_and_turn_length_in_characters() {
    let turn = json!({"role": "user", "text": "x", "captured_at": "2026-10-22T10:00:00Z"});
    assert_eq!(code(body(|v| v["turns"] = json!([]))), "invalid_input");
    assert_eq!(code(body(|v| v["turns"] = json!(vec![turn.clone(); MAX_TURNS + 1]))), "invalid_input");
    assert!(body(|v| v["turns"] = json!(vec![turn; MAX_TURNS])).is_ok());

    // Multibyte text is measured in characters, not bytes.
    let wide = "é".repeat(MAX_TURN_CHARS);
    assert!(body(|v| v["turns"][0]["text"] = json!(wide)).is_ok());
    let long = "x".repeat(MAX_TURN_CHARS + 1);
    assert_eq!(code(body(|v| v["turns"][0]["text"] = json!(long))), "invalid_input");
}

#[test]
fn rejects_unknown_roles_and_bad_or_ancient_times() {
    assert_eq!(code(body(|v| v["turns"][0]["role"] = json!("system"))), "invalid_input");
    assert_eq!(code(body(|v| v["turns"][0]["captured_at"] = json!("yesterday"))), "invalid_input");
    assert_eq!(code(body(|v| v["turns"][0]["captured_at"] = json!("1999-01-01T00:00:00Z"))), "invalid_input");
}

#[test]
fn long_or_blank_titles_are_cut_or_dropped() {
    let long = body(|v| v["conversation"]["title"] = json!("t".repeat(MAX_TITLE_CHARS + 50))).unwrap();
    assert_eq!(long.title.map(|t| t.chars().count()), Some(MAX_TITLE_CHARS));
    assert_eq!(body(|v| v["conversation"]["title"] = json!(" \n ")).unwrap().title, None);
    assert_eq!(body(|v| v["conversation"]["title"] = json!(null)).unwrap().title, None);
}
