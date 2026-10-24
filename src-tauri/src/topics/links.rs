//! Note links resolved to topics (`NoteLinkRef` in `src/api/contract/graph.ts`), and the
//! topic pairs they connect. Resolution happens on read, so links follow topic names.
//! It matches the frontend's `resolveLinkTarget` (`src/features/topic/model/note.ts`), so
//! the map never shows a link the note itself can't follow.

use std::collections::{BTreeMap, HashMap, HashSet};

use rusqlite::{params, Connection};
use serde::Serialize;

use super::dto::MAX_ALIASES;
use crate::db::repo::note_links::{self, LinkRow};
use crate::error::AppResult;

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteLinkRefDto {
    /// The topic whose note holds the link.
    pub topic_id: String,
    pub line: i64,
    pub text: String,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ResolvedLink {
    pub source: i64,
    pub target: i64,
    pub line: i64,
    /// The note line, when it was asked for.
    pub context: Option<String>,
}

/// How many note lines link a pair, and when those notes last changed.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct PairSummary {
    pub lines: i64,
    /// The latest `updated_at` among the notes holding these links.
    pub last_updated: Option<String>,
}

/// The links between one pair of topics, from either side's note.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct PairLinks {
    /// Ordered by source topic, then line.
    pub refs: Vec<NoteLinkRefDto>,
    pub summary: PairSummary,
}

/// Unordered pair key, smaller id first (the same order `edges` uses).
pub fn pair_key(a: i64, b: i64) -> (i64, i64) {
    (a.min(b), a.max(b))
}

/// How link targets and topic names compare: whitespace collapsed and trimmed, lowercased.
/// The same as the frontend's `linkKey`.
pub fn link_key(name: &str) -> String {
    name.split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase()
}

/// Link key → topic: every title first, then the aliases a topic summary shows (the first
/// `MAX_ALIASES` labels that aren't the title), so a title always beats an alias. Among
/// equals, the topic with more ideas, then the older one.
pub struct LinkIndex {
    keys: HashMap<String, i64>,
}

impl LinkIndex {
    pub fn load(conn: &Connection) -> AppResult<Self> {
        let mut titles = conn.prepare(
            "select id, name from topics where merged_into is null order by idea_count desc, id",
        )?;
        let mut keys: HashMap<String, i64> = HashMap::new();
        for row in titles.query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?)))? {
            let (id, name) = row?;
            keys.entry(link_key(&name)).or_insert(id);
        }
        // Same selection and order as `fill_topic`, for every topic at once.
        let mut labels = conn.prepare(
            "select l.topic_id, l.label from topic_labels l join topics t on t.id = l.topic_id
              where t.merged_into is null and lower(l.label) != lower(t.name)
              order by t.idea_count desc, t.id, l.is_primary desc, l.id",
        )?;
        let mut taken: HashMap<i64, usize> = HashMap::new();
        let mut aliases: Vec<(String, i64)> = Vec::new();
        for row in labels.query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?)))? {
            let (id, label) = row?;
            let count = taken.entry(id).or_default();
            if *count < MAX_ALIASES {
                *count += 1;
                aliases.push((link_key(&label), id));
            }
        }
        for (key, id) in aliases {
            keys.entry(key).or_insert(id);
        }
        keys.remove("");
        Ok(LinkIndex { keys })
    }

    /// A key starting with `#` points inside a note (`[[#Heading]]`), never at a topic.
    fn get(&self, key: &str) -> Option<i64> {
        if key.is_empty() || key.starts_with('#') {
            return None;
        }
        self.keys.get(key).copied()
    }

    /// The whole target first (titles like "C#"), then the part before its `#`.
    pub fn resolve(&self, row: &LinkRow) -> Option<i64> {
        self.get(&row.target_key)
            .or_else(|| row.base_key.as_deref().and_then(|b| self.get(b)))
    }
}

/// Stored links whose target names a live topic other than their source, de-duplicated
/// per source, target and line.
fn resolve(rows: Vec<LinkRow>, index: &LinkIndex) -> Vec<ResolvedLink> {
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    for row in rows {
        let Some(target) = index.resolve(&row) else {
            continue;
        };
        if target == row.source_topic || !seen.insert((row.source_topic, target, row.line)) {
            continue;
        }
        out.push(ResolvedLink {
            source: row.source_topic,
            target,
            line: row.line,
            context: row.context,
        });
    }
    out
}

/// Every resolved link, with the note line it sits on.
pub fn resolve_all(conn: &Connection) -> AppResult<Vec<ResolvedLink>> {
    let index = LinkIndex::load(conn)?;
    Ok(resolve(note_links::all(conn, true)?, &index))
}

fn note_times(conn: &Connection) -> AppResult<HashMap<i64, String>> {
    let mut stmt = conn.prepare("select topic_id, updated_at from topic_notes")?;
    let rows = stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?;
    Ok(rows.collect::<Result<_, _>>()?)
}

fn add_to_summary(summary: &mut PairSummary, at: Option<&String>) {
    summary.lines += 1;
    if at > summary.last_updated.as_ref() {
        summary.last_updated = at.cloned();
    }
}

/// Counts and timestamps per linked pair, without reading the note lines (for the map).
pub fn pair_summaries(conn: &Connection) -> AppResult<BTreeMap<(i64, i64), PairSummary>> {
    let index = LinkIndex::load(conn)?;
    let times = note_times(conn)?;
    let mut out: BTreeMap<(i64, i64), PairSummary> = BTreeMap::new();
    for link in resolve(note_links::all(conn, false)?, &index) {
        let entry = out.entry(pair_key(link.source, link.target)).or_default();
        add_to_summary(entry, times.get(&link.source));
    }
    Ok(out)
}

/// Every pair of topics linked from either one's note, with the linking lines.
pub fn pairs(conn: &Connection) -> AppResult<BTreeMap<(i64, i64), PairLinks>> {
    let times = note_times(conn)?;
    let mut out: BTreeMap<(i64, i64), PairLinks> = BTreeMap::new();
    for link in resolve_all(conn)? {
        let entry = out.entry(pair_key(link.source, link.target)).or_default();
        add_to_summary(&mut entry.summary, times.get(&link.source));
        entry.refs.push(NoteLinkRefDto {
            topic_id: link.source.to_string(),
            line: link.line,
            text: link.context.unwrap_or_default(),
        });
    }
    for links in out.values_mut() {
        links
            .refs
            .sort_by_key(|r| (r.topic_id.parse::<i64>().unwrap_or_default(), r.line));
    }
    Ok(out)
}

/// Topics connected to `topic_id` by any stored edge or any note link, either direction.
pub fn connected(conn: &Connection, topic_id: i64) -> AppResult<HashSet<i64>> {
    let mut stmt = conn.prepare(
        "select case when topic_a = ?1 then topic_b else topic_a end from edges
          where topic_a = ?1 or topic_b = ?1",
    )?;
    let mut out: HashSet<i64> = stmt
        .query_map(params![topic_id], |r| r.get(0))?
        .collect::<Result<_, _>>()?;
    let index = LinkIndex::load(conn)?;
    for link in resolve(note_links::all(conn, false)?, &index) {
        if link.source == topic_id {
            out.insert(link.target);
        } else if link.target == topic_id {
            out.insert(link.source);
        }
    }
    Ok(out)
}

#[cfg(test)]
#[path = "links_tests.rs"]
mod tests;
