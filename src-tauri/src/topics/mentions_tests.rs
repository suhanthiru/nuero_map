use super::*;
use crate::db::repo::topics;
use crate::db::Db;
use crate::topics::note::save_note;

/// Adds an idea (with a source message) to a topic; returns its id.
pub(crate) fn seed_idea(
    c: &Connection,
    topic_id: i64,
    title: &str,
    excerpt: &str,
    at: &str,
) -> i64 {
    c.execute(
        "insert or ignore into conversations (id, source, source_conv_id, title, created_at, updated_at, updated_marker, content_hash, imported_at)
         values (1, 'claude', 'c1', 'Chat', ?1, ?1, ?1, 'h', ?1)",
        [at],
    )
    .unwrap();
    c.execute(
        "insert or ignore into extraction_windows (id, conversation_id, window_index, first_seq, last_seq, window_hash, created_at, updated_at)
         values (1, 1, 0, 0, 999, 'w', ?1, ?1)",
        [at],
    )
    .unwrap();
    let n: i64 = c
        .query_row("select count(*) from ideas", [], |r| r.get(0))
        .unwrap();
    c.execute(
        "insert into messages (conversation_id, source_msg_id, seq, role, text, created_at)
         values (1, ?1, ?2, 'user', ?3, ?4)",
        params![format!("m{n}"), n, excerpt, at],
    )
    .unwrap();
    let message = c.last_insert_rowid();
    c.execute(
        "insert into ideas (conversation_id, window_id, idea_index, title, summary, kind, topic_label, excerpt,
                            excerpt_verified, is_user_originated, gem_candidate, first_message_at, topic_id, created_at)
         values (1, 1, ?1, ?2, '', 'insight', 'x', ?3, 1, 1, 0, ?4, ?5, ?4)",
        params![n, title, excerpt, at, topic_id],
    )
    .unwrap();
    let idea = c.last_insert_rowid();
    c.execute(
        "insert into idea_messages (idea_id, message_id) values (?1, ?2)",
        [idea, message],
    )
    .unwrap();
    idea
}

fn needles(names: &[&str]) -> Vec<Needle> {
    names.iter().filter_map(|n| Needle::new(n)).collect()
}

#[test]
fn matches_whole_words_ignoring_case() {
    let n = needles(&["Rust", "C#"]);

    assert_eq!(find_mention("I like RUST.", &n, &[]), Some((7, 11)));
    assert_eq!(find_mention("Rusty trusts", &n, &[]), None);
    assert_eq!(find_mention("C#'s syntax", &n, &[]), Some((0, 2)));
    assert_eq!(
        find_mention("in [[Rust]] and rust", &n, &[(3, 11)]),
        Some((16, 20))
    );
    assert!(
        Needle::new("x").is_none(),
        "one-letter names are too common to look for"
    );
}

#[test]
fn prefers_the_earliest_then_the_longest_match() {
    let n = needles(&["decay", "decay scoring"]);

    assert_eq!(find_mention("Decay scoring, decay", &n, &[]), Some((0, 13)));
}

#[test]
fn a_match_must_cover_whole_characters() {
    // "İ" lowercases to two chars; a needle of just its first can't end inside it.
    let n = needles(&["ai"]);

    assert_eq!(find_mention("Aİ", &n, &[]), None);
    assert_eq!(find_mention("AI tools", &n, &[]), Some((0, 2)));
}

#[test]
fn note_mentions_skip_links_and_code_and_report_utf16_offsets() {
    let db = Db::open_in_memory().unwrap();

    let found = db
        .call_blocking(|c| {
            let decay = topics::create(c, "Decay scoring")?;
            let other = topics::create(c, "Neural map")?;
            save_note(
                c,
                other,
                "😀 decay scoring here\n[[Decay scoring]] linked\n```\ndecay scoring\n```\n`decay scoring`",
            )?;
            save_note(c, decay, "decay scoring in its own note")?;
            unlinked_mentions(c, decay)
        })
        .unwrap();

    assert_eq!(found.len(), 1);
    let m = &found[0];
    assert_eq!((m.source, m.line, m.start, m.end), ("note", Some(1), 3, 16));
    assert_eq!(m.topic.title, "Neural map");
    assert_eq!(m.text, "😀 decay scoring here");
    let json = serde_json::to_value(m).unwrap();
    assert_eq!(json["excerpt"], serde_json::Value::Null);
    assert_eq!(json["source"], "note");
}

#[test]
fn idea_mentions_come_only_from_unconnected_topics() {
    let db = Db::open_in_memory().unwrap();

    let found = db
        .call_blocking(|c| {
            let decay = topics::create(c, "Decay scoring")?;
            topics::add_label(c, decay, "half-life", false)?;
            let loose = topics::create(c, "Robot arm")?;
            let linked = topics::create(c, "Neural map")?;
            let edged = topics::create(c, "Systems book")?;
            seed_idea(
                c,
                loose,
                "Servo smoothing",
                "Use a half-life for the jitter filter",
                "2026-10-01T00:00:00Z",
            );
            seed_idea(c, loose, "Decay scoring idea", "nothing here", "2026-10-02T00:00:00Z");
            seed_idea(c, linked, "Graph", "decay scoring again", "2026-10-03T00:00:00Z");
            seed_idea(c, edged, "Stocks", "decay scoring is a flow", "2026-10-04T00:00:00Z");
            seed_idea(c, decay, "Own idea", "decay scoring itself", "2026-10-05T00:00:00Z");
            save_note(c, linked, "[[Decay scoring]]")?;
            c.execute(
                "insert into edges (topic_a, topic_b, kind, strength, evidence_count, first_seen_at, last_seen_at)
                 values (?1, ?2, 'cooccurrence', 0.5, 1, 'x', 'x')",
                [decay.min(edged), decay.max(edged)],
            )?;
            unlinked_mentions(c, decay)
        })
        .unwrap();

    let got: Vec<_> = found
        .iter()
        .map(|m| (m.source, m.text.as_str(), m.start, m.end))
        .collect();
    assert_eq!(
        got,
        vec![
            ("idea", "Decay scoring idea", 0, 13),
            ("idea", "Use a half-life for the jitter filter", 6, 15),
        ]
    );
    assert!(found
        .iter()
        .all(|m| m.topic.title == "Robot arm" && m.excerpt.is_some() && m.line.is_none()));
}

#[test]
fn unknown_topics_are_not_found() {
    let db = Db::open_in_memory().unwrap();

    let err = db.call_blocking(|c| unlinked_mentions(c, 42)).unwrap_err();

    assert_eq!(err.code(), "not_found");
}

#[test]
fn link_spans_cover_markdown_links_autolinks_and_bare_urls() {
    let text = "a [Homelab docs](https://x.io/homelab) b <https://y.io/homelab> c https://github.com/me/homelab d ![homelab](h.png)";

    let spans: Vec<&str> = link_spans(text).iter().map(|&(a, b)| &text[a..b]).collect();

    assert_eq!(
        spans,
        vec![
            "[Homelab docs](https://x.io/homelab)",
            "<https://y.io/homelab>",
            "https://github.com/me/homelab",
            "![homelab](h.png)",
        ]
    );
    assert!(link_spans("[not a link] (gap) <b>").is_empty());
}

#[test]
fn note_mentions_never_land_inside_links_or_urls() {
    let db = Db::open_in_memory().unwrap();

    let found = db
        .call_blocking(|c| {
            let homelab = topics::create(c, "Homelab")?;
            let other = topics::create(c, "Server notes")?;
            save_note(
                c,
                other,
                "repo: https://github.com/me/homelab\n[my homelab](https://h.io) <https://h.io/homelab>\nthe homelab box",
            )?;
            unlinked_mentions(c, homelab)
        })
        .unwrap();

    let got: Vec<_> = found.iter().map(|m| (m.line, m.start, m.end)).collect();
    assert_eq!(got, vec![(Some(3), 4, 11)]);
}

#[test]
fn a_crlf_note_line_comes_back_verbatim() {
    let db = Db::open_in_memory().unwrap();

    let found = db
        .call_blocking(|c| {
            let decay = topics::create(c, "Decay")?;
            let other = topics::create(c, "Notes")?;
            save_note(c, other, "first decay\r\nsecond")?;
            unlinked_mentions(c, decay)
        })
        .unwrap();

    assert_eq!(found[0].text, "first decay\r");
    assert_eq!((found[0].start, found[0].end), (6, 11));
}

#[test]
fn non_ascii_names_are_found_in_any_case() {
    let db = Db::open_in_memory().unwrap();

    let found = db
        .call_blocking(|c| {
            let eclair = topics::create(c, "Éclair")?;
            let greek = topics::create(c, "ωμ")?;
            let baking = topics::create(c, "Baking")?;
            seed_idea(
                c,
                baking,
                "Pastry",
                "an ÉCLAIR recipe",
                "2026-10-01T00:00:00Z",
            );
            seed_idea(
                c,
                baking,
                "Letters",
                "about ΩΜ here",
                "2026-10-02T00:00:00Z",
            );
            Ok((unlinked_mentions(c, eclair)?, unlinked_mentions(c, greek)?))
        })
        .unwrap();

    assert_eq!(found.0.len(), 1, "the SQL pass keeps \"clair\" to look for");
    assert_eq!((found.0[0].start, found.0[0].end), (3, 9));
    assert_eq!(
        found.1.len(),
        1,
        "nothing to pre-filter on, so every idea is checked"
    );
    assert_eq!((found.1[0].start, found.1[0].end), (6, 8));
}

#[test]
fn prefilter_keys_keep_what_sqlite_can_case_fold() {
    let key = |s: &str| Needle::new(s).and_then(|n| n.prefilter_key());

    assert_eq!(key("Decay scoring").as_deref(), Some("decay scoring"));
    assert_eq!(key("Éclair").as_deref(), Some("clair"));
    assert_eq!(key("日本語").as_deref(), Some("日本語"));
    assert_eq!(key("ωμ"), None);
}
