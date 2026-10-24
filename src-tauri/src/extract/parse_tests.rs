use super::*;

fn part(id: i64, text: &str, at: &str) -> Part {
    Part {
        message_id: id,
        seq: id,
        role: "user".into(),
        text: text.into(),
        created_at: at.into(),
        part_index: 0,
        part_count: 1,
    }
}

fn parts() -> Vec<Part> {
    vec![
        part(
            10,
            "What if my chats became a neural graph?",
            "2026-01-01T00:00:02.000000Z",
        ),
        part(
            11,
            "The graph is the trap and the retrieval is the product.",
            "2026-01-01T00:00:01.000000Z",
        ),
    ]
}

fn idea(indices: &str, excerpt: &str, gem: bool, related: &str) -> String {
    format!(
        r#"{{"title":"T","summary":"S","kind":"insight","topic_label":"Neural map app","topic_aliases":["neural map app","idea graph","idea graph"],
            "source_message_indices":{indices},"excerpt":"{excerpt}","is_user_originated":true,"gem_candidate":{gem},"related_idea_indices":{related}}}"#
    )
}

fn run(ideas: &[String]) -> (Vec<ValidIdea>, usize) {
    let json = format!(r#"{{"ideas":[{}]}}"#, ideas.join(","));
    parse_extraction(&json, &parts(), &HashMap::new()).unwrap()
}

#[test]
fn maps_indices_to_message_ids_and_verifies_excerpts() {
    let (ideas, dropped) = run(&[idea("[1, 0]", "the RETRIEVAL   is the product", true, "[]")]);

    assert_eq!(dropped, 0);
    let v = &ideas[0];
    assert_eq!(v.message_ids, [10, 11]);
    assert!(v.excerpt_verified, "whitespace and case are normalized");
    assert!(v.gem_candidate);
    assert_eq!(v.first_message_at, "2026-01-01T00:00:01.000000Z");
    assert_eq!(
        v.aliases,
        ["idea graph"],
        "aliases are deduped and never repeat the label"
    );
}

#[test]
fn a_paraphrased_excerpt_is_unverified_and_cannot_be_a_gem() {
    let (ideas, _) = run(&[idea(
        "[1]",
        "retrieval matters more than graphs",
        true,
        "[]",
    )]);

    assert!(!ideas[0].excerpt_verified);
    assert!(!ideas[0].gem_candidate);
}

#[test]
fn drops_ideas_with_no_valid_source_indices() {
    let (ideas, dropped) = run(&[
        idea("[5, -1]", "x", false, "[]"),
        idea("[0]", "neural graph", false, "[]"),
    ]);

    assert_eq!(dropped, 1);
    assert_eq!(ideas.len(), 1);
    assert_eq!(ideas[0].idea_index, 1);
}

#[test]
fn keeps_only_relations_to_other_surviving_ideas() {
    let (ideas, _) = run(&[
        idea("[0]", "neural graph", false, "[0, 1, 2, 9]"),
        idea("[9]", "dropped", false, "[]"),
        idea("[1]", "the product", false, "[0]"),
    ]);

    assert_eq!(ideas[0].related, [2]);
    assert_eq!(ideas[1].related, [0]);
}

#[test]
fn checks_excerpts_against_the_full_message_when_parts_are_slices() {
    let mut full = HashMap::new();
    full.insert(
        10,
        "Prefix text. What if my chats became a neural graph? Suffix.".to_owned(),
    );
    let json = format!(
        r#"{{"ideas":[{}]}}"#,
        idea("[0]", "Prefix text.", false, "[]")
    );

    let (ideas, _) = parse_extraction(&json, &parts(), &full).unwrap();

    assert!(ideas[0].excerpt_verified);
}

#[test]
fn rejects_output_that_does_not_match_the_schema() {
    let err = parse_extraction(r#"{"notes": []}"#, &parts(), &HashMap::new()).unwrap_err();

    assert_eq!(err.code(), "api_error");
}
