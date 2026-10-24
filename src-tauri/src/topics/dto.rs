//! Shapes the frontend reads (`src/api/contract`), built from the database.
//! Ids are strings on the wire.

use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::Serialize;

use crate::error::AppResult;

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceRefDto {
    pub message_id: String,
    pub conversation_id: String,
    pub app: String,
    pub speaker: String,
    pub timestamp: String,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct ExcerptDto {
    pub text: String,
    pub source: SourceRefDto,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TopicSummaryDto {
    pub id: String,
    pub title: String,
    pub aliases: Vec<String>,
    pub state: String,
    pub decay: f64,
    pub idea_count: i64,
    pub summary: String,
    pub created_at: String,
    pub last_active_at: String,
    pub check_in_at: Option<String>,
}

/// Aliases a topic summary carries (the frontend resolves `[[links]]` against these).
pub const MAX_ALIASES: usize = 4;

/// Columns selected by every topic summary query, in this order.
pub const TOPIC_COLUMNS: &str = "t.id, t.name, t.state, t.decay_score, t.idea_count, t.created_at,
     coalesce(t.last_mention_at, t.created_at), t.check_in_at";

pub fn topic_from_row(r: &Row) -> rusqlite::Result<TopicSummaryDto> {
    Ok(TopicSummaryDto {
        id: r.get::<_, i64>(0)?.to_string(),
        title: r.get(1)?,
        state: r.get(2)?,
        decay: r.get(3)?,
        idea_count: r.get(4)?,
        created_at: r.get(5)?,
        last_active_at: r.get(6)?,
        check_in_at: r.get(7)?,
        aliases: Vec::new(),
        summary: String::new(),
    })
}

/// Aliases (labels other than the name) and a one-line summary (latest idea's).
pub fn fill_topic(conn: &Connection, mut t: TopicSummaryDto) -> AppResult<TopicSummaryDto> {
    let id: i64 = t.id.parse().unwrap_or_default();
    let mut stmt = conn.prepare_cached(
        "select label from topic_labels where topic_id = ?1 and lower(label) != lower(?2) order by is_primary desc, id limit ?3",
    )?;
    t.aliases = stmt
        .query_map(params![id, t.title, MAX_ALIASES as i64], |r| r.get(0))?
        .collect::<Result<_, _>>()?;
    t.summary = conn
        .query_row(
            "select summary from ideas where topic_id = ?1 order by first_message_at desc limit 1",
            [id],
            |r| r.get(0),
        )
        .optional()?
        .unwrap_or_default();
    Ok(t)
}

pub fn topic_summary(conn: &Connection, id: i64) -> AppResult<Option<TopicSummaryDto>> {
    let sql =
        format!("select {TOPIC_COLUMNS} from topics t where t.id = ?1 and t.merged_into is null");
    match conn.query_row(&sql, [id], topic_from_row).optional()? {
        Some(t) => Ok(Some(fill_topic(conn, t)?)),
        None => Ok(None),
    }
}

/// The idea's excerpt, attributed to the cited message that contains it (else the first).
pub fn idea_excerpt(conn: &Connection, idea_id: i64) -> AppResult<Option<ExcerptDto>> {
    let excerpt: Option<String> = conn
        .query_row("select excerpt from ideas where id = ?1", [idea_id], |r| {
            r.get(0)
        })
        .optional()?;
    let Some(text) = excerpt else { return Ok(None) };
    let mut stmt = conn.prepare_cached(
        "select m.id, m.conversation_id, c.source, m.role, m.created_at, m.text
           from idea_messages im join messages m on m.id = im.message_id
           join conversations c on c.id = m.conversation_id
          where im.idea_id = ?1 order by m.seq",
    )?;
    let cited: Vec<(SourceRefDto, String)> = stmt
        .query_map([idea_id], |r| {
            Ok((
                SourceRefDto {
                    message_id: r.get::<_, i64>(0)?.to_string(),
                    conversation_id: r.get::<_, i64>(1)?.to_string(),
                    app: r.get(2)?,
                    speaker: r.get(3)?,
                    timestamp: r.get(4)?,
                },
                r.get(5)?,
            ))
        })?
        .collect::<Result<_, _>>()?;
    let needle = text.to_lowercase();
    let pick = cited
        .iter()
        .find(|(_, body)| body.to_lowercase().contains(&needle))
        .or(cited.first());
    Ok(pick.map(|(source, _)| ExcerptDto {
        text: text.clone(),
        source: source.clone(),
    }))
}
