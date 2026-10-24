use std::collections::HashMap;

use rusqlite::{params, Connection, OptionalExtension};

use crate::db::ts;
use crate::error::AppResult;
use crate::ingest::model::{NormalizedConversation, Source};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StoredFingerprint {
    pub id: i64,
    pub updated_marker: String,
    pub content_hash: String,
}

pub fn find(
    conn: &Connection,
    source: Source,
    source_id: &str,
) -> AppResult<Option<StoredFingerprint>> {
    Ok(conn
        .query_row(
            "select id, updated_marker, content_hash from conversations where source = ?1 and source_conv_id = ?2",
            params![source.as_str(), source_id],
            |r| {
                Ok(StoredFingerprint {
                    id: r.get(0)?,
                    updated_marker: r.get(1)?,
                    content_hash: r.get(2)?,
                })
            },
        )
        .optional()?)
}

/// source_conv_id → fingerprint, for estimating what an import would change.
pub fn fingerprints(
    conn: &Connection,
    source: Source,
) -> AppResult<HashMap<String, StoredFingerprint>> {
    let mut stmt = conn.prepare(
        "select source_conv_id, id, updated_marker, content_hash from conversations where source = ?1",
    )?;
    let rows = stmt.query_map(params![source.as_str()], |r| {
        Ok((
            r.get::<_, String>(0)?,
            StoredFingerprint {
                id: r.get(1)?,
                updated_marker: r.get(2)?,
                content_hash: r.get(3)?,
            },
        ))
    })?;
    Ok(rows.collect::<Result<_, _>>()?)
}

pub fn insert(
    conn: &Connection,
    conv: &NormalizedConversation,
    hash: &str,
    now: &str,
) -> AppResult<i64> {
    conn.execute(
        "insert into conversations
           (source, source_conv_id, title, url, created_at, updated_at, updated_marker, content_hash, message_count, imported_at)
         values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![
            conv.source.as_str(),
            conv.source_id,
            conv.title,
            conv.url,
            ts(conv.created_at),
            ts(conv.updated_at),
            conv.updated_marker,
            hash,
            conv.messages.len() as i64,
            now,
        ],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn update(
    conn: &Connection,
    id: i64,
    conv: &NormalizedConversation,
    hash: &str,
    now: &str,
) -> AppResult<()> {
    conn.execute(
        "update conversations
            set title = ?2, url = ?3, updated_at = ?4, updated_marker = ?5, content_hash = ?6,
                message_count = ?7, imported_at = ?8
          where id = ?1",
        params![
            id,
            conv.title,
            conv.url,
            ts(conv.updated_at),
            conv.updated_marker,
            hash,
            conv.messages.len() as i64,
            now,
        ],
    )?;
    Ok(())
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ConversationHeader {
    pub id: i64,
    pub source: String,
    pub title: String,
    pub url: Option<String>,
}

pub fn header(conn: &Connection, id: i64) -> AppResult<Option<ConversationHeader>> {
    Ok(conn
        .query_row(
            "select id, source, title, url from conversations where id = ?1",
            params![id],
            |r| {
                Ok(ConversationHeader {
                    id: r.get(0)?,
                    source: r.get(1)?,
                    title: r.get(2)?,
                    url: r.get(3)?,
                })
            },
        )
        .optional()?)
}
