//! Text search over topic names/aliases, the user's own notes (titles and text), and idea
//! titles/summaries.

use rusqlite::{params, Connection};
use serde::Serialize;

use crate::config::vault::SEARCH_SNIPPET_LEAD;
use crate::error::AppResult;

const TOPIC_SCORE: f64 = 1.0;
const NOTE_SCORE: f64 = 0.8;
const IDEA_SCORE: f64 = 0.6;
const SNIPPET_CHARS: usize = 140;

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    pub kind: String,
    pub id: String,
    pub topic_id: Option<String>,
    /// Set for `note` hits.
    pub note_id: Option<String>,
    pub title: String,
    pub snippet: String,
    pub score: f64,
}

/// LIKE patterns treat % and _ as wildcards; escape them so they match literally.
fn like_pattern(query: &str) -> String {
    let escaped = query
        .trim()
        .to_lowercase()
        .replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_");
    format!("%{escaped}%")
}

fn snippet(text: &str) -> String {
    text.chars().take(SNIPPET_CHARS).collect()
}

/// A note's text on one line, from a little before the first match (or from the start).
fn note_snippet(body: &str, query: &str) -> String {
    let flat = body.split_whitespace().collect::<Vec<_>>().join(" ");
    let needle = query.trim().to_lowercase();
    let lower = flat.to_lowercase();
    // Lowercasing can change byte lengths outside ASCII; then just start at the top.
    let at = (lower.len() == flat.len())
        .then(|| lower.find(&needle))
        .flatten()
        .filter(|at| flat.is_char_boundary(*at))
        .map_or(0, |at| flat[..at].chars().count());
    let start = at.saturating_sub(SEARCH_SNIPPET_LEAD);
    let text: String = flat.chars().skip(start).take(SNIPPET_CHARS).collect();
    if start > 0 {
        format!("…{}", text.trim_start())
    } else {
        text
    }
}

pub fn search(conn: &Connection, query: &str, limit: i64) -> AppResult<Vec<SearchHit>> {
    if query.trim().is_empty() {
        return Ok(Vec::new());
    }
    let pattern = like_pattern(query);
    let mut topics_stmt = conn.prepare(
        "select distinct t.id, t.name, coalesce((select summary from ideas where topic_id = t.id order by first_message_at desc limit 1), '')
           from topics t join topic_labels l on l.topic_id = t.id
          where t.merged_into is null and (lower(l.label) like ?1 escape '\\')
          order by t.decay_score desc limit ?2",
    )?;
    let mut hits: Vec<SearchHit> = topics_stmt
        .query_map(params![pattern, limit], |r| {
            let id: i64 = r.get(0)?;
            Ok(SearchHit {
                kind: "topic".into(),
                id: id.to_string(),
                topic_id: Some(id.to_string()),
                note_id: None,
                title: r.get(1)?,
                snippet: snippet(&r.get::<_, String>(2)?),
                score: TOPIC_SCORE,
            })
        })?
        .collect::<Result<_, _>>()?;
    let mut notes_stmt = conn.prepare(
        "select id, title, body from vault_notes
          where lower(title) like ?1 escape '\\' or lower(body) like ?1 escape '\\'
          order by updated_at desc limit ?2",
    )?;
    let notes = notes_stmt.query_map(params![pattern, limit], |r| {
        let id = r.get::<_, i64>(0)?.to_string();
        Ok(SearchHit {
            kind: "note".into(),
            id: id.clone(),
            topic_id: None,
            note_id: Some(id),
            title: r.get(1)?,
            snippet: note_snippet(&r.get::<_, String>(2)?, query),
            score: NOTE_SCORE,
        })
    })?;
    hits.extend(notes.collect::<Result<Vec<_>, _>>()?);
    let mut ideas_stmt = conn.prepare(
        "select id, topic_id, title, summary from ideas
          where lower(title) like ?1 escape '\\' or lower(summary) like ?1 escape '\\'
          order by first_message_at desc limit ?2",
    )?;
    let ideas = ideas_stmt.query_map(params![pattern, limit], |r| {
        Ok(SearchHit {
            kind: "idea".into(),
            id: r.get::<_, i64>(0)?.to_string(),
            topic_id: r.get::<_, Option<i64>>(1)?.map(|t| t.to_string()),
            note_id: None,
            title: r.get(2)?,
            snippet: snippet(&r.get::<_, String>(3)?),
            score: IDEA_SCORE,
        })
    })?;
    hits.extend(ideas.collect::<Result<Vec<_>, _>>()?);
    hits.truncate(usize::try_from(limit).unwrap_or(0));
    Ok(hits)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::repo::topics;
    use crate::db::Db;
    use crate::vault::ops;

    #[test]
    fn escapes_like_wildcards() {
        assert_eq!(like_pattern(" 50%_off "), "%50\\%\\_off%");
    }

    #[test]
    fn finds_notes_by_title_or_text_after_topics() {
        let db = Db::open_in_memory().unwrap();

        let hits = db
            .call_blocking(|c| {
                topics::create(c, "Lisbon trip")?;
                ops::create_note(
                    c,
                    None,
                    Some("Packing"),
                    "Tram 28 to the castle.\nBook the lisbon ferry early.",
                )?;
                ops::create_note(c, None, Some("Lisbon budget"), "")?;
                ops::create_note(c, None, Some("Unrelated"), "nothing here")?;
                search(c, "lisbon", 10)
            })
            .unwrap();

        let got: Vec<(&str, &str)> = hits
            .iter()
            .map(|h| (h.kind.as_str(), h.title.as_str()))
            .collect();
        assert_eq!(got.len(), 3, "{got:?}");
        assert_eq!(got[0], ("topic", "Lisbon trip"));
        assert!(got[1..].contains(&("note", "Packing")));
        assert!(got[1..].contains(&("note", "Lisbon budget")));
        let packing = hits.iter().find(|h| h.title == "Packing").unwrap();
        assert_eq!(packing.note_id.as_deref(), Some(packing.id.as_str()));
        assert_eq!(packing.topic_id, None);
        assert_eq!(hits[0].note_id, None);
        let json = serde_json::to_value(packing).unwrap();
        assert!(json["noteId"].is_string());
        assert!(json["topicId"].is_null());
    }

    #[test]
    fn note_snippets_start_a_little_before_the_match_on_one_line() {
        let body = format!("{}\n\nthe needle is here", "word ".repeat(30));

        let snippet = note_snippet(&body, "Needle");

        assert!(snippet.starts_with('…'), "{snippet}");
        assert!(snippet.contains("the needle is here"));
        assert!(!snippet.contains('\n'));
        assert_eq!(note_snippet("short text", "absent"), "short text");
    }
}
