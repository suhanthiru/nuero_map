use super::*;
use crate::db::repo::topics;
use crate::db::Db;
use crate::topics::note::save_note;

fn targets(v: &[ResolvedLink]) -> Vec<i64> {
    v.iter().map(|l| l.target).collect()
}

#[test]
fn resolves_titles_before_aliases_and_follows_renames() {
    let db = Db::open_in_memory().unwrap();

    let (before, after, ids) = db
        .call_blocking(|c| {
            let notes = topics::create(c, "Neural map")?;
            let decay = topics::create(c, "Decay scoring")?;
            let other = topics::create(c, "Half-life")?;
            topics::add_label(c, decay, "half-life", false)?;
            save_note(
                c,
                notes,
                "[[Half-life]] [[decay  scoring#Tuning]] [[Later topic]] [[Neural map]]",
            )?;
            let before = resolve_all(c)?;
            // A topic created after the link was written picks it up; a rename keeps the old name.
            let later = topics::create(c, "Later topic")?;
            topics::rename(c, decay, "Fading score")?;
            Ok((before, resolve_all(c)?, (notes, decay, other, later)))
        })
        .unwrap();

    let (notes, decay, other, later) = ids;
    assert_eq!(
        targets(&before),
        vec![other, decay],
        "the title beats the alias; no self-links"
    );
    assert_eq!(targets(&after), vec![other, decay, later]);
    assert!(after.iter().all(|l| l.source == notes && l.line == 1));
}

#[test]
fn keeps_punctuation_so_similar_names_stay_apart() {
    let db = Db::open_in_memory().unwrap();

    let (links, ids) = db
        .call_blocking(|c| {
            let notes = topics::create(c, "Notes")?;
            let sharp = topics::create(c, "C#")?;
            let plus = topics::create(c, "C++")?;
            topics::create(c, "Open questions")?;
            save_note(c, notes, "[[c#]] [[C++]] [[#Open questions]] [[C]]")?;
            Ok((resolve_all(c)?, (sharp, plus)))
        })
        .unwrap();

    assert_eq!(
        targets(&links),
        vec![ids.0, ids.1],
        "a #heading link points inside a note, never at a topic"
    );
}

#[test]
fn only_the_aliases_a_topic_summary_shows_resolve() {
    let db = Db::open_in_memory().unwrap();

    let links = db
        .call_blocking(|c| {
            let notes = topics::create(c, "Notes")?;
            let t = topics::create(c, "Topic")?;
            for alias in ["one", "two", "three", "four", "five"] {
                topics::add_label(c, t, alias, false)?;
            }
            save_note(c, notes, "[[four]]\n[[five]]")?;
            resolve_all(c)
        })
        .unwrap();

    assert_eq!(
        links.iter().map(|l| l.line).collect::<Vec<_>>(),
        vec![1],
        "the fifth alias isn't one the app can see"
    );
}

#[test]
fn groups_both_directions_into_one_pair_and_reports_connections() {
    let db = Db::open_in_memory().unwrap();

    let (pairs, summaries, connected_to_a, a, b) = db
        .call_blocking(|c| {
            let a = topics::create(c, "Alpha")?;
            let b = topics::create(c, "Beta")?;
            save_note(c, a, "[[Beta]]\n\nagain [[Beta]]")?;
            save_note(c, b, "back to [[Alpha]]")?;
            Ok((pairs(c)?, pair_summaries(c)?, connected(c, a)?, a, b))
        })
        .unwrap();

    let links = &pairs[&pair_key(a, b)];
    let refs: Vec<_> = links
        .refs
        .iter()
        .map(|r| (r.topic_id.clone(), r.line, r.text.clone()))
        .collect();
    assert_eq!(
        refs,
        vec![
            (a.to_string(), 1, "[[Beta]]".to_string()),
            (a.to_string(), 3, "again [[Beta]]".to_string()),
            (b.to_string(), 1, "back to [[Alpha]]".to_string()),
        ]
    );
    assert_eq!(summaries[&pair_key(a, b)], links.summary);
    assert_eq!(links.summary.lines, 3);
    assert!(links.summary.last_updated.is_some());
    assert_eq!(connected_to_a, HashSet::from([b]));
}

#[test]
fn merged_topics_neither_link_nor_get_linked() {
    let db = Db::open_in_memory().unwrap();

    let links = db
        .call_blocking(|c| {
            let a = topics::create(c, "Alpha")?;
            let b = topics::create(c, "Beta")?;
            save_note(c, a, "[[Beta]]")?;
            c.execute("update topics set merged_into = ?1 where id = ?2", [a, b])?;
            resolve_all(c)
        })
        .unwrap();

    assert!(links.is_empty());
}
