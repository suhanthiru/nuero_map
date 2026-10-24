//! Topic list and the topic page.

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

use super::dto::{
    fill_topic, idea_excerpt, topic_from_row, topic_summary, ExcerptDto, TopicSummaryDto,
    TOPIC_COLUMNS,
};
use super::links::{self, pair_key, NoteLinkRefDto};
use crate::error::{AppError, AppResult};
use crate::graph::view::{edge_dto, note_edge, EdgeDto};

const DEFAULT_LIMIT: i64 = 500;
const PAGE_EVIDENCE_PER_LINK: i64 = 2;

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TopicFilter {
    pub states: Option<Vec<String>>,
    pub query: Option<String>,
    pub sort: Option<String>,
    pub limit: Option<i64>,
}

pub fn list_topics(conn: &Connection, filter: &TopicFilter) -> AppResult<Vec<TopicSummaryDto>> {
    let order = match filter.sort.as_deref() {
        Some("recent") => "coalesce(t.last_mention_at, t.created_at) desc",
        Some("ideas") => "t.idea_count desc",
        Some("name") => "t.name collate nocase",
        _ => "t.decay_score desc",
    };
    let states = filter.states.clone().unwrap_or_else(|| {
        ["active", "parked", "done", "dead"]
            .map(String::from)
            .to_vec()
    });
    let states_json = serde_json::to_string(&states)?;
    let like = format!(
        "%{}%",
        filter.query.as_deref().unwrap_or("").trim().to_lowercase()
    );
    let sql = format!(
        "select {TOPIC_COLUMNS} from topics t
          where t.merged_into is null and t.state in (select value from json_each(?1))
            and lower(t.name) like ?2
          order by {order} limit ?3"
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(
        params![states_json, like, filter.limit.unwrap_or(DEFAULT_LIMIT)],
        topic_from_row,
    )?;
    rows.map(|r| fill_topic(conn, r?)).collect()
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IdeaDto {
    pub id: String,
    pub title: String,
    pub summary: String,
    pub kind: String,
    pub excerpt: ExcerptDto,
    pub occurred_at: String,
    pub is_user_originated: bool,
    pub duplicate_of: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GemDto {
    pub id: String,
    pub topic_id: String,
    pub idea_id: String,
    pub excerpt: ExcerptDto,
    pub pinned_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionDto {
    pub edge: EdgeDto,
    pub topic: TopicSummaryDto,
    pub evidence: Vec<ExcerptDto>,
    /// `[[links]]` between the two topics in either one's note.
    pub note_links: Vec<NoteLinkRefDto>,
}

#[derive(Debug, Serialize)]
pub struct TopicPageDto {
    pub topic: TopicSummaryDto,
    /// Topic syntheses arrive with Phase 6; until then the page shows ideas only.
    pub current: Option<serde_json::Value>,
    pub history: Vec<serde_json::Value>,
    pub gems: Vec<GemDto>,
    pub ideas: Vec<IdeaDto>,
    pub connections: Vec<ConnectionDto>,
}

struct IdeaRow {
    id: i64,
    title: String,
    summary: String,
    kind: String,
    occurred_at: String,
    user: bool,
    duplicate_of: Option<i64>,
}

fn ideas_of(conn: &Connection, topic_id: i64) -> AppResult<Vec<IdeaDto>> {
    let mut stmt = conn.prepare(
        "select id, title, summary, kind, first_message_at, is_user_originated, duplicate_of_idea_id
           from ideas where topic_id = ?1 order by first_message_at desc",
    )?;
    let rows: Vec<IdeaRow> = stmt
        .query_map([topic_id], |r| {
            Ok(IdeaRow {
                id: r.get(0)?,
                title: r.get(1)?,
                summary: r.get(2)?,
                kind: r.get(3)?,
                occurred_at: r.get(4)?,
                user: r.get(5)?,
                duplicate_of: r.get(6)?,
            })
        })?
        .collect::<Result<_, _>>()?;
    let mut out = Vec::with_capacity(rows.len());
    for row in rows {
        let Some(excerpt) = idea_excerpt(conn, row.id)? else {
            continue;
        };
        out.push(IdeaDto {
            id: row.id.to_string(),
            title: row.title,
            summary: row.summary,
            kind: row.kind,
            excerpt,
            occurred_at: row.occurred_at,
            is_user_originated: row.user,
            duplicate_of: row.duplicate_of.map(|d| d.to_string()),
        });
    }
    Ok(out)
}

fn gems_of(conn: &Connection, topic_id: i64) -> AppResult<Vec<GemDto>> {
    let mut stmt = conn.prepare(
        "select id, idea_id, pinned_at from gems where topic_id = ?1 order by pinned_at desc",
    )?;
    let rows: Vec<(i64, i64, String)> = stmt
        .query_map([topic_id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))?
        .collect::<Result<_, _>>()?;
    let mut out = Vec::new();
    for (id, idea_id, pinned_at) in rows {
        if let Some(excerpt) = idea_excerpt(conn, idea_id)? {
            out.push(GemDto {
                id: id.to_string(),
                topic_id: topic_id.to_string(),
                idea_id: idea_id.to_string(),
                excerpt,
                pinned_at,
            });
        }
    }
    Ok(out)
}

fn connections_of(conn: &Connection, topic_id: i64) -> AppResult<Vec<ConnectionDto>> {
    let mut stmt = conn.prepare(
        "select id, case when topic_a = ?1 then topic_b else topic_a end from edges
          where topic_a = ?1 or topic_b = ?1 order by strength desc",
    )?;
    let rows: Vec<(i64, i64)> = stmt
        .query_map([topic_id], |r| Ok((r.get(0)?, r.get(1)?)))?
        .collect::<Result<_, _>>()?;
    let mut ev_stmt = conn.prepare_cached(
        "select case when ?2 = (select topic_a from edges where id = ?1) then idea_b else idea_a end
           from edge_evidence where edge_id = ?1 order by at desc limit ?3",
    )?;
    let mut pairs = links::pairs(conn)?;
    let mut out = Vec::new();
    for (edge_id, other) in rows {
        let (Some(mut edge), Some(topic)) = (edge_dto(conn, edge_id)?, topic_summary(conn, other)?)
        else {
            continue;
        };
        let note_links = pairs.remove(&pair_key(topic_id, other));
        if let Some(links) = &note_links {
            if edge.yields_to_note_link() {
                // The user's own link outranks similarity: show it as a note connection.
                edge = note_edge(pair_key(topic_id, other), &links.summary);
            }
            edge.linked_in_note = true;
        }
        let note_links = note_links.map(|l| l.refs).unwrap_or_default();
        let idea_ids: Vec<i64> = ev_stmt
            .query_map(params![edge_id, topic_id, PAGE_EVIDENCE_PER_LINK], |r| {
                r.get(0)
            })?
            .collect::<Result<_, _>>()?;
        let evidence = idea_ids
            .into_iter()
            .filter_map(|i| idea_excerpt(conn, i).transpose())
            .collect::<AppResult<_>>()?;
        out.push(ConnectionDto {
            edge,
            topic,
            evidence,
            note_links,
        });
    }
    // Pairs only a note link connects (what's left after the evidence edges took theirs).
    for (pair, links) in pairs {
        let other = match pair {
            (a, b) if a == topic_id => b,
            (a, b) if b == topic_id => a,
            _ => continue,
        };
        let Some(topic) = topic_summary(conn, other)? else {
            continue;
        };
        out.push(ConnectionDto {
            edge: note_edge(pair, &links.summary),
            topic,
            evidence: Vec::new(),
            note_links: links.refs,
        });
    }
    out.sort_by(|a, b| b.edge.strength.total_cmp(&a.edge.strength));
    Ok(out)
}

pub fn topic_page(conn: &Connection, topic_id: i64) -> AppResult<TopicPageDto> {
    let topic = topic_summary(conn, topic_id)?
        .ok_or_else(|| AppError::NotFound(format!("topic {topic_id}")))?;
    Ok(TopicPageDto {
        topic,
        current: None,
        history: Vec::new(),
        gems: gems_of(conn, topic_id)?,
        ideas: ideas_of(conn, topic_id)?,
        connections: connections_of(conn, topic_id)?,
    })
}

pub fn pin_gem(conn: &Connection, topic_id: i64, idea_id: i64) -> AppResult<GemDto> {
    let now = crate::db::now_ts();
    conn.execute(
        "insert or ignore into gems (topic_id, idea_id, pinned_at) values (?1, ?2, ?3)",
        params![topic_id, idea_id, now],
    )?;
    let (id, pinned_at): (i64, String) = conn.query_row(
        "select id, pinned_at from gems where topic_id = ?1 and idea_id = ?2",
        params![topic_id, idea_id],
        |r| Ok((r.get(0)?, r.get(1)?)),
    )?;
    let excerpt = idea_excerpt(conn, idea_id)?
        .ok_or_else(|| AppError::NotFound(format!("idea {idea_id}")))?;
    Ok(GemDto {
        id: id.to_string(),
        topic_id: topic_id.to_string(),
        idea_id: idea_id.to_string(),
        excerpt,
        pinned_at,
    })
}
