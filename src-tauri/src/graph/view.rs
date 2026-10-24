//! The graph as the frontend draws it, and the evidence behind one connection.

use std::collections::{BTreeMap, HashSet};

use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;

use crate::config::graph::{EVIDENCE_LIMIT, NOTE_LINK_STRENGTH, RECENT_LINK_DAYS};
use crate::db::now_ts;
use crate::error::{AppError, AppResult};
use crate::topics::dto::{
    fill_topic, idea_excerpt, topic_from_row, topic_summary, ExcerptDto, TopicSummaryDto,
    TOPIC_COLUMNS,
};
use crate::topics::links::{self, pair_key, NoteLinkRefDto, PairSummary};

/// Id prefix of connections made only by note links (they have no `edges` row).
pub const NOTE_EDGE_PREFIX: &str = "note-";

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EdgeDto {
    pub id: String,
    pub source: String,
    pub target: String,
    pub kind: String,
    pub strength: f64,
    pub evidence_count: i64,
    pub last_seen_at: String,
    /// Also linked with `[[…]]` in either topic's note.
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub linked_in_note: bool,
}

impl EdgeDto {
    pub fn pair(&self) -> Option<(i64, i64)> {
        Some(pair_key(
            self.source.parse().ok()?,
            self.target.parse().ok()?,
        ))
    }

    /// Similarity alone is weaker evidence than the user's own `[[link]]`, so a note link
    /// replaces a semantic edge rather than hiding behind it (the map hides weak links).
    pub fn yields_to_note_link(&self) -> bool {
        self.kind == "semantic"
    }
}

/// The connection a note link makes on its own, for a pair with no chat evidence.
pub fn note_edge(pair: (i64, i64), links: &PairSummary) -> EdgeDto {
    EdgeDto {
        id: format!("{NOTE_EDGE_PREFIX}{}-{}", pair.0, pair.1),
        source: pair.0.to_string(),
        target: pair.1.to_string(),
        kind: "note".into(),
        strength: NOTE_LINK_STRENGTH,
        evidence_count: links.lines,
        last_seen_at: links.last_updated.clone().unwrap_or_else(now_ts),
        linked_in_note: true,
    }
}

/// Marks note-linked evidence edges, and gives every other linked pair a `note` edge
/// (replacing a semantic one). Pairs with a topic outside `nodes` (dead, merged) get none.
pub fn with_note_links(
    edges: Vec<EdgeDto>,
    pairs: &BTreeMap<(i64, i64), PairSummary>,
    nodes: &HashSet<i64>,
) -> Vec<EdgeDto> {
    let mut covered = HashSet::new();
    let mut out: Vec<EdgeDto> = Vec::with_capacity(edges.len());
    for mut edge in edges {
        if let Some(pair) = edge.pair().filter(|p| pairs.contains_key(p)) {
            if edge.yields_to_note_link() {
                continue;
            }
            edge.linked_in_note = true;
            covered.insert(pair);
        }
        out.push(edge);
    }
    for (pair, links) in pairs {
        if !covered.contains(pair) && nodes.contains(&pair.0) && nodes.contains(&pair.1) {
            out.push(note_edge(*pair, links));
        }
    }
    out
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphNodeDto {
    #[serde(flatten)]
    pub topic: TopicSummaryDto,
    pub recently_linked: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphDto {
    pub nodes: Vec<GraphNodeDto>,
    pub edges: Vec<EdgeDto>,
    pub generated_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EdgeEvidenceDto {
    pub edge: EdgeDto,
    pub topics: (TopicSummaryDto, TopicSummaryDto),
    pub excerpts: Vec<ExcerptDto>,
    /// The note lines that link the two topics (empty when none do).
    pub note_links: Vec<NoteLinkRefDto>,
}

const EDGE_SELECT: &str =
    "select id, topic_a, topic_b, kind, strength, evidence_count, last_seen_at from edges";

fn edge_from_row(r: &rusqlite::Row) -> rusqlite::Result<EdgeDto> {
    Ok(EdgeDto {
        id: r.get::<_, i64>(0)?.to_string(),
        source: r.get::<_, i64>(1)?.to_string(),
        target: r.get::<_, i64>(2)?.to_string(),
        kind: r.get(3)?,
        strength: r.get(4)?,
        evidence_count: r.get(5)?,
        last_seen_at: r.get(6)?,
        linked_in_note: false,
    })
}

pub fn edge_dto(conn: &Connection, id: i64) -> AppResult<Option<EdgeDto>> {
    Ok(conn
        .query_row(&format!("{EDGE_SELECT} where id = ?1"), [id], edge_from_row)
        .optional()?)
}

fn recent_cutoff() -> String {
    crate::db::ts(chrono::Utc::now() - chrono::Duration::days(RECENT_LINK_DAYS))
}

/// Every live topic and every connection; the frontend filters for instant toggles.
pub fn graph(conn: &Connection, include_dead: bool, include_semantic: bool) -> AppResult<GraphDto> {
    let sql = format!(
        "select {TOPIC_COLUMNS},
                exists(select 1 from edges e where (e.topic_a = t.id or e.topic_b = t.id)
                         and e.kind != 'semantic' and e.first_seen_at >= ?1)
           from topics t where t.merged_into is null and (?2 or t.state != 'dead')"
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows: Vec<(TopicSummaryDto, bool)> = stmt
        .query_map(params![recent_cutoff(), include_dead], |r| {
            Ok((topic_from_row(r)?, r.get(8)?))
        })?
        .collect::<Result<_, _>>()?;
    let nodes = rows
        .into_iter()
        .map(|(t, recently_linked)| {
            Ok(GraphNodeDto {
                topic: fill_topic(conn, t)?,
                recently_linked,
            })
        })
        .collect::<AppResult<Vec<_>>>()?;
    let mut edge_stmt = conn.prepare(&format!("{EDGE_SELECT} where ?1 or kind != 'semantic'"))?;
    let edges = edge_stmt
        .query_map([include_semantic], edge_from_row)?
        .collect::<Result<_, _>>()?;
    let node_ids: HashSet<i64> = nodes
        .iter()
        .filter_map(|n| n.topic.id.parse().ok())
        .collect();
    let edges = with_note_links(edges, &links::pair_summaries(conn)?, &node_ids);
    Ok(GraphDto {
        nodes,
        edges,
        generated_at: now_ts(),
    })
}

/// `note-<a>-<b>` → the pair, smaller id first.
/// Digits only: `parse` would also take "+5", and ids are never written that way.
fn strict_id(raw: &str) -> Option<i64> {
    if raw.is_empty() || !raw.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    raw.parse().ok()
}

fn parse_note_edge_id(id: &str) -> Option<(i64, i64)> {
    let (a, b) = id.strip_prefix(NOTE_EDGE_PREFIX)?.split_once('-')?;
    Some(pair_key(strict_id(a)?, strict_id(b)?))
}

/// Evidence for an edge id as the frontend sends it: a number, or `note-<a>-<b>`.
pub fn edge_evidence_by_id(conn: &Connection, raw_id: &str) -> AppResult<EdgeEvidenceDto> {
    let not_found = || AppError::NotFound(format!("edge {raw_id}"));
    if let Some(id) = strict_id(raw_id) {
        return edge_evidence(conn, id);
    }
    let pair = parse_note_edge_id(raw_id).ok_or_else(not_found)?;
    let mut pairs = links::pairs(conn)?;
    let links = pairs.remove(&pair).ok_or_else(not_found)?;
    let (Some(ta), Some(tb)) = (topic_summary(conn, pair.0)?, topic_summary(conn, pair.1)?) else {
        return Err(not_found());
    };
    Ok(EdgeEvidenceDto {
        edge: note_edge(pair, &links.summary),
        topics: (ta, tb),
        excerpts: Vec::new(),
        note_links: links.refs,
    })
}

/// Excerpts from both sides of each place the two topics met, newest first.
pub fn edge_evidence(conn: &Connection, edge_id: i64) -> AppResult<EdgeEvidenceDto> {
    let mut edge =
        edge_dto(conn, edge_id)?.ok_or_else(|| AppError::NotFound(format!("edge {edge_id}")))?;
    let note_links = match edge.pair() {
        Some(pair) => links::pairs(conn)?
            .remove(&pair)
            .map(|l| l.refs)
            .unwrap_or_default(),
        None => Vec::new(),
    };
    edge.linked_in_note = !note_links.is_empty();
    let a: i64 = edge.source.parse().unwrap_or_default();
    let b: i64 = edge.target.parse().unwrap_or_default();
    let (Some(ta), Some(tb)) = (topic_summary(conn, a)?, topic_summary(conn, b)?) else {
        return Err(AppError::NotFound(format!("topics of edge {edge_id}")));
    };
    let mut stmt = conn.prepare(
        "select idea_a, idea_b from edge_evidence where edge_id = ?1 order by at desc limit ?2",
    )?;
    let pairs: Vec<(i64, i64)> = stmt
        .query_map(params![edge_id, EVIDENCE_LIMIT], |r| {
            Ok((r.get(0)?, r.get(1)?))
        })?
        .collect::<Result<_, _>>()?;
    let mut seen = std::collections::HashSet::new();
    let mut excerpts = Vec::new();
    for idea in pairs.into_iter().flat_map(|(x, y)| [x, y]) {
        if let Some(ex) = idea_excerpt(conn, idea)? {
            if seen.insert(ex.source.message_id.clone()) {
                excerpts.push(ex);
            }
        }
    }
    if excerpts.is_empty() {
        // Similarity-only links have no shared moment; show each topic's latest idea.
        for t in [a, b] {
            let latest: Option<i64> = conn
                .query_row("select id from ideas where topic_id = ?1 order by first_message_at desc limit 1", [t], |r| r.get(0))
                .optional()?;
            if let Some(ex) = latest.map(|i| idea_excerpt(conn, i)).transpose()?.flatten() {
                excerpts.push(ex);
            }
        }
    }
    Ok(EdgeEvidenceDto {
        edge,
        topics: (ta, tb),
        excerpts,
        note_links,
    })
}

#[cfg(test)]
#[path = "view_tests.rs"]
mod tests;
