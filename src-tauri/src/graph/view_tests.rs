use super::*;
use crate::db::repo::topics;
use crate::db::Db;
use crate::topics::note::save_note;
use crate::topics::page::topic_page;

fn add_edge(c: &Connection, x: i64, y: i64) -> AppResult<()> {
    let (a, b) = pair_key(x, y);
    c.execute(
        "insert into edges (topic_a, topic_b, kind, strength, evidence_count, first_seen_at, last_seen_at)
         values (?1, ?2, 'cooccurrence', 0.4, 1, 'x', 'x')",
        [a, b],
    )?;
    Ok(())
}

fn edge_between(g: &GraphDto, x: i64, y: i64) -> Option<EdgeDto> {
    let (p, q) = pair_key(x, y);
    g.edges
        .iter()
        .find(|e| e.source == p.to_string() && e.target == q.to_string())
        .cloned()
}

#[test]
fn note_links_mark_edges_and_add_note_edges_for_live_topics() {
    let db = Db::open_in_memory().unwrap();

    let (with_dead, without_dead, ids) = db
        .call_blocking(|c| {
            let a = topics::create(c, "Alpha")?;
            let b = topics::create(c, "Beta")?;
            let d = topics::create(c, "Delta")?;
            let gone = topics::create(c, "Gone")?;
            add_edge(c, a, d)?;
            save_note(c, a, "[[Beta]] [[Delta]]\n[[Beta]] [[Gone]]")?;
            topics::set_state(c, gone, "dead", None)?;
            Ok((
                graph(c, true, false)?,
                graph(c, false, false)?,
                (a, b, d, gone),
            ))
        })
        .unwrap();

    let (a, b, d, gone) = ids;
    let evidence = edge_between(&with_dead, a, d).unwrap();
    assert_eq!(evidence.kind, "cooccurrence");
    assert!(evidence.linked_in_note);
    let note = edge_between(&with_dead, a, b).unwrap();
    let (p, q) = pair_key(a, b);
    assert_eq!(note.id, format!("note-{p}-{q}"));
    assert_eq!(
        (note.kind.as_str(), note.strength, note.evidence_count),
        ("note", NOTE_LINK_STRENGTH, 2)
    );
    assert!(note.linked_in_note);
    assert!(edge_between(&with_dead, a, gone).is_some());
    assert!(
        edge_between(&without_dead, a, gone).is_none(),
        "a dead topic's links stay off the map"
    );

    let json = serde_json::to_value(&without_dead).unwrap();
    assert!(json["edges"]
        .as_array()
        .unwrap()
        .iter()
        .all(|e| e["linkedInNote"] == true));
}

#[test]
fn plain_edges_leave_linked_in_note_out_of_the_json() {
    let db = Db::open_in_memory().unwrap();

    let g = db
        .call_blocking(|c| {
            let a = topics::create(c, "Alpha")?;
            let b = topics::create(c, "Beta")?;
            add_edge(c, a, b)?;
            graph(c, false, false)
        })
        .unwrap();

    let json = serde_json::to_value(&g).unwrap();
    assert!(json["edges"][0].get("linkedInNote").is_none());
}

#[test]
fn evidence_for_note_edges_lists_the_linking_lines() {
    let db = Db::open_in_memory().unwrap();

    let (ev, numeric, bad, unlinked) = db
        .call_blocking(|c| {
            let a = topics::create(c, "Alpha")?;
            let b = topics::create(c, "Beta")?;
            let d = topics::create(c, "Delta")?;
            add_edge(c, a, d)?;
            save_note(c, b, "back to [[Alpha]]")?;
            save_note(c, d, "[[alpha]]")?;
            let (p, q) = pair_key(a, b);
            let edge_id: i64 = c.query_row("select id from edges", [], |r| r.get(0))?;
            Ok((
                edge_evidence_by_id(c, &format!("note-{p}-{q}"))?,
                edge_evidence_by_id(c, &edge_id.to_string())?,
                edge_evidence_by_id(c, "note-x"),
                edge_evidence_by_id(c, &format!("note-{a}-{d}9")),
            ))
        })
        .unwrap();

    assert!(ev.excerpts.is_empty());
    assert_eq!(ev.edge.kind, "note");
    assert_eq!(ev.note_links.len(), 1);
    assert_eq!(
        (ev.note_links[0].line, ev.note_links[0].text.as_str()),
        (1, "back to [[Alpha]]")
    );
    assert!(numeric.edge.linked_in_note);
    assert_eq!(numeric.note_links[0].text, "[[alpha]]");
    let json = serde_json::to_value(&ev).unwrap();
    assert_eq!(json["noteLinks"][0]["topicId"], ev.note_links[0].topic_id);
    assert_eq!(bad.unwrap_err().code(), "not_found");
    assert_eq!(unlinked.unwrap_err().code(), "not_found");
}

#[test]
fn the_topic_page_lists_note_only_connections_with_their_links() {
    let db = Db::open_in_memory().unwrap();

    let page = db
        .call_blocking(|c| {
            let a = topics::create(c, "Alpha")?;
            let b = topics::create(c, "Beta")?;
            let d = topics::create(c, "Delta")?;
            add_edge(c, a, d)?;
            save_note(c, b, "[[Alpha]]")?;
            topic_page(c, a)
        })
        .unwrap();

    let got: Vec<_> = page
        .connections
        .iter()
        .map(|cx| {
            (
                cx.topic.title.as_str(),
                cx.edge.kind.as_str(),
                cx.note_links.len(),
            )
        })
        .collect();
    assert_eq!(got, vec![("Beta", "note", 1), ("Delta", "cooccurrence", 0)]);
    let json = serde_json::to_value(&page.connections[0]).unwrap();
    assert_eq!(json["noteLinks"][0]["text"], "[[Alpha]]");
}

#[test]
fn a_note_link_replaces_a_semantic_edge_on_the_map_and_the_page() {
    let db = Db::open_in_memory().unwrap();

    let (g, page, ids) = db
        .call_blocking(|c| {
            let a = topics::create(c, "Alpha")?;
            let b = topics::create(c, "Beta")?;
            let (p, q) = pair_key(a, b);
            c.execute(
                "insert into edges (topic_a, topic_b, kind, strength, evidence_count, first_seen_at, last_seen_at)
                 values (?1, ?2, 'semantic', 0.1, 0, 'x', 'x')",
                [p, q],
            )?;
            save_note(c, a, "[[Beta]]")?;
            Ok((graph(c, false, true)?, topic_page(c, a)?, (a, b)))
        })
        .unwrap();

    let between: Vec<_> = g
        .edges
        .iter()
        .filter(|e| e.pair() == Some(pair_key(ids.0, ids.1)))
        .collect();
    assert_eq!(between.len(), 1);
    assert_eq!(between[0].kind, "note");
    assert!(between[0].id.starts_with("note-"));
    assert_eq!(page.connections.len(), 1);
    assert_eq!(page.connections[0].edge.kind, "note");
    assert!(page.connections[0].edge.linked_in_note);
}

#[test]
fn edge_ids_are_digits_only() {
    let db = Db::open_in_memory().unwrap();

    let (plus_note, plus_plain, self_pair) = db
        .call_blocking(|c| {
            let a = topics::create(c, "Alpha")?;
            let b = topics::create(c, "Beta")?;
            add_edge(c, a, b)?;
            save_note(c, a, "[[Beta]]")?;
            let (p, q) = pair_key(a, b);
            let edge_id: i64 = c.query_row("select id from edges", [], |r| r.get(0))?;
            Ok((
                edge_evidence_by_id(c, &format!("note-+{p}-+{q}")),
                edge_evidence_by_id(c, &format!("+{edge_id}")),
                edge_evidence_by_id(c, &format!("note-{a}-{a}")),
            ))
        })
        .unwrap();

    assert_eq!(plus_note.unwrap_err().code(), "not_found");
    assert_eq!(plus_plain.unwrap_err().code(), "not_found");
    assert_eq!(self_pair.unwrap_err().code(), "not_found");
}
