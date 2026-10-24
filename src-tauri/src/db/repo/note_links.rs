use rusqlite::{params, Connection};

use crate::error::AppResult;
use crate::topics::links::link_key;
use crate::topics::wikilinks::{self, base_target};

/// One stored `[[link]]` occurrence, target not yet resolved.
#[derive(Debug, Clone, PartialEq)]
pub struct LinkRow {
    pub source_topic: i64,
    /// `link_key` of the whole target, and of the part before its `#` when that differs.
    pub target_key: String,
    pub base_key: Option<String>,
    pub line: i64,
    /// The note line, verbatim; only read when asked for.
    pub context: Option<String>,
}

/// Replaces every link stored for `source_topic` with the ones in `body`.
pub fn replace_for_note(conn: &Connection, source_topic: i64, body: &str) -> AppResult<()> {
    delete_for_note(conn, source_topic)?;
    let lines: Vec<&str> = body.split('\n').collect();
    let mut insert = conn.prepare_cached(
        "insert or ignore into note_links (source_topic, target_key, base_key, line, context)
         values (?1, ?2, ?3, ?4, ?5)",
    )?;
    for link in wikilinks::parse(body) {
        let key = link_key(&link.target);
        if key.is_empty() {
            continue;
        }
        let base = base_target(&link.target)
            .map(link_key)
            .filter(|b| !b.is_empty() && *b != key);
        // Verbatim, `\r` included, so it compares equal to the note's own line.
        let context = lines.get(link.line as usize - 1).copied().unwrap_or("");
        insert.execute(params![source_topic, key, base, link.line, context])?;
    }
    Ok(())
}

pub fn delete_for_note(conn: &Connection, source_topic: i64) -> AppResult<()> {
    conn.execute(
        "delete from note_links where source_topic = ?1",
        [source_topic],
    )?;
    Ok(())
}

/// Every stored link whose source topic is still live, in source then line order. The
/// note lines are only read when `with_context` is set (the map just counts).
pub fn all(conn: &Connection, with_context: bool) -> AppResult<Vec<LinkRow>> {
    let mut stmt = conn.prepare(
        "select l.source_topic, l.target_key, l.base_key, l.line, case when ?1 then l.context end
           from note_links l join topics t on t.id = l.source_topic
          where t.merged_into is null
          order by l.source_topic, l.line, l.id",
    )?;
    let rows = stmt.query_map([with_context], |r| {
        Ok(LinkRow {
            source_topic: r.get(0)?,
            target_key: r.get(1)?,
            base_key: r.get(2)?,
            line: r.get(3)?,
            context: r.get(4)?,
        })
    })?;
    Ok(rows.collect::<Result<_, _>>()?)
}

/// Rebuilds the links of every saved note (notes written before links were stored).
/// Returns how many notes were read.
pub fn backfill(conn: &Connection) -> AppResult<usize> {
    let mut stmt = conn.prepare("select topic_id, body from topic_notes")?;
    let notes: Vec<(i64, String)> = stmt
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?
        .collect::<Result<_, _>>()?;
    for (topic_id, body) in &notes {
        replace_for_note(conn, *topic_id, body)?;
    }
    Ok(notes.len())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::repo::topics;
    use crate::db::Db;

    #[test]
    fn stores_link_keys_with_their_line_and_replaces_on_save() {
        let db = Db::open_in_memory().unwrap();

        let rows = db
            .call_blocking(|c| {
                let id = topics::create(c, "Neural map")?;
                replace_for_note(c, id, "old [[Gone]]")?;
                replace_for_note(
                    c,
                    id,
                    "intro\n- see [[Decay  Scoring]] and [[Rust#Async|async]]\r\n[[Decay scoring]]",
                )?;
                all(c, true)
            })
            .unwrap();

        let got: Vec<_> = rows
            .iter()
            .map(|r| (r.target_key.as_str(), r.base_key.as_deref(), r.line))
            .collect();
        assert_eq!(
            got,
            vec![
                ("decay scoring", None, 2),
                ("rust#async", Some("rust"), 2),
                ("decay scoring", None, 3),
            ]
        );
        assert_eq!(
            rows[0].context.as_deref(),
            Some("- see [[Decay  Scoring]] and [[Rust#Async|async]]\r"),
            "kept verbatim, line ending and all"
        );
    }

    #[test]
    fn reads_without_context_when_only_counting() {
        let db = Db::open_in_memory().unwrap();

        let rows = db
            .call_blocking(|c| {
                let id = topics::create(c, "Neural map")?;
                replace_for_note(c, id, "[[Decay]]")?;
                all(c, false)
            })
            .unwrap();

        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].context, None);
    }
}
