use chrono::{DateTime, Utc};
use rusqlite::{params, Connection, OptionalExtension};

use crate::db::ts;
use crate::error::{AppError, AppResult};
use crate::ingest::model::{NormalizedMessage, Role};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TimeSource {
    Source,
    Capture,
}

impl TimeSource {
    fn as_str(self) -> &'static str {
        match self {
            TimeSource::Source => "source",
            TimeSource::Capture => "capture",
        }
    }
}

fn count_for(conn: &Connection, conversation_id: i64) -> AppResult<i64> {
    Ok(conn.query_row(
        "select count(*) from messages where conversation_id = ?1",
        params![conversation_id],
        |r| r.get(0),
    )?)
}

/// Makes the stored active branch match `messages`: new ones are inserted, existing ones
/// get their position/text refreshed, and anything no longer on the branch is marked
/// superseded (kept, never deleted). Returns how many messages were newly inserted.
pub fn sync_branch(
    conn: &Connection,
    conversation_id: i64,
    messages: &[NormalizedMessage],
    time_source: TimeSource,
) -> AppResult<usize> {
    let before = count_for(conn, conversation_id)?;
    conn.execute(
        "update messages set superseded = 1 where conversation_id = ?1",
        params![conversation_id],
    )?;
    let mut upsert = conn.prepare_cached(
        "insert into messages (conversation_id, source_msg_id, seq, role, text, created_at, time_source, superseded)
         values (?1, ?2, ?3, ?4, ?5, ?6, ?7, 0)
         on conflict (conversation_id, source_msg_id) do update
            set seq = excluded.seq, role = excluded.role, text = excluded.text,
                created_at = excluded.created_at, superseded = 0",
    )?;
    for m in messages {
        upsert.execute(params![
            conversation_id,
            m.source_msg_id,
            m.seq,
            m.role.as_str(),
            m.text,
            ts(m.created_at),
            time_source.as_str(),
        ])?;
    }
    let after = count_for(conn, conversation_id)?;
    Ok((after - before).max(0) as usize)
}

/// The active branch in order, as it would be written back by `sync_branch`.
pub fn active_branch(conn: &Connection, conversation_id: i64) -> AppResult<Vec<NormalizedMessage>> {
    let mut stmt = conn.prepare(
        "select source_msg_id, role, text, created_at, seq from messages
          where conversation_id = ?1 and superseded = 0 order by seq, id",
    )?;
    let rows = stmt.query_map(params![conversation_id], |r| {
        Ok((
            r.get::<_, String>(0)?,
            r.get::<_, String>(1)?,
            r.get::<_, String>(2)?,
            r.get::<_, String>(3)?,
            r.get::<_, u32>(4)?,
        ))
    })?;
    let mut out = Vec::new();
    for row in rows {
        let (source_msg_id, role, text, created_at, seq) = row?;
        let role = match role.as_str() {
            "user" => Role::User,
            "assistant" => Role::Assistant,
            other => return Err(AppError::internal(format!("unknown stored role {other}"))),
        };
        let created_at = DateTime::parse_from_rfc3339(&created_at)
            .map_err(|e| AppError::internal(format!("unreadable message time {created_at}: {e}")))?
            .with_timezone(&Utc);
        out.push(NormalizedMessage {
            source_msg_id,
            role,
            text,
            created_at,
            seq,
        });
    }
    Ok(out)
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StoredMessage {
    pub id: i64,
    pub role: String,
    pub text: String,
    pub created_at: String,
}

/// The message plus up to `turns` active-branch messages on either side.
pub fn with_context(
    conn: &Connection,
    message_id: i64,
    turns: u32,
) -> AppResult<Option<(i64, Vec<StoredMessage>)>> {
    let focus: Option<(i64, i64)> = conn
        .query_row(
            "select conversation_id, seq from messages where id = ?1",
            params![message_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()?;
    let Some((conversation_id, seq)) = focus else {
        return Ok(None);
    };
    let mut stmt = conn.prepare(
        "select id, role, text, created_at from messages
          where conversation_id = ?1 and (superseded = 0 or id = ?4) and seq between ?2 and ?3
          order by seq, id",
    )?;
    let window = i64::from(turns);
    let rows = stmt.query_map(
        params![conversation_id, seq - window, seq + window, message_id],
        |r| {
            Ok(StoredMessage {
                id: r.get(0)?,
                role: r.get(1)?,
                text: r.get(2)?,
                created_at: r.get(3)?,
            })
        },
    )?;
    Ok(Some((conversation_id, rows.collect::<Result<_, _>>()?)))
}
