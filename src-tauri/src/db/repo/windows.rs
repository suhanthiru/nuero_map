use rusqlite::{params, Connection, OptionalExtension};

use crate::db::now_ts;
use crate::error::AppResult;
use crate::extract::windows::{ExistingWindow, PlannedWindow, WindowMessage};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StoredWindow {
    pub id: i64,
    pub conversation_id: i64,
    pub window_index: i64,
    pub first_seq: i64,
    pub last_seq: i64,
    pub part_index: usize,
    pub part_count: usize,
    pub hash: String,
    pub status: String,
    pub attempts: i64,
}

const SELECT: &str =
    "select id, conversation_id, window_index, first_seq, last_seq, part_index, part_count,
                             window_hash, status, attempts from extraction_windows";

fn from_row(r: &rusqlite::Row) -> rusqlite::Result<StoredWindow> {
    Ok(StoredWindow {
        id: r.get(0)?,
        conversation_id: r.get(1)?,
        window_index: r.get(2)?,
        first_seq: r.get(3)?,
        last_seq: r.get(4)?,
        part_index: r.get::<_, i64>(5)? as usize,
        part_count: r.get::<_, i64>(6)? as usize,
        hash: r.get(7)?,
        status: r.get(8)?,
        attempts: r.get(9)?,
    })
}

impl StoredWindow {
    pub fn as_existing(&self) -> ExistingWindow {
        ExistingWindow {
            first_seq: self.first_seq,
            last_seq: self.last_seq,
            part_index: self.part_index,
            part_count: self.part_count,
            hash: self.hash.clone(),
        }
    }
}

pub fn for_conversation(conn: &Connection, conversation_id: i64) -> AppResult<Vec<StoredWindow>> {
    let mut stmt = conn.prepare(&format!(
        "{SELECT} where conversation_id = ?1 order by window_index"
    ))?;
    let rows = stmt.query_map([conversation_id], from_row)?;
    Ok(rows.collect::<Result<_, _>>()?)
}

pub fn get(conn: &Connection, id: i64) -> AppResult<Option<StoredWindow>> {
    Ok(conn
        .query_row(&format!("{SELECT} where id = ?1"), [id], from_row)
        .optional()?)
}

pub fn with_status(conn: &Connection, status: &str) -> AppResult<Vec<StoredWindow>> {
    let mut stmt = conn.prepare(&format!("{SELECT} where status = ?1 order by id"))?;
    let rows = stmt.query_map([status], from_row)?;
    Ok(rows.collect::<Result<_, _>>()?)
}

/// Windows still marked submitted for a batch (e.g. missing from its results).
pub fn submitted_in_batch(conn: &Connection, batch_id: &str) -> AppResult<Vec<i64>> {
    let mut stmt = conn.prepare(
        "select id from extraction_windows where status = 'submitted' and batch_id = ?1",
    )?;
    let rows = stmt.query_map([batch_id], |r| r.get(0))?;
    Ok(rows.collect::<Result<_, _>>()?)
}

pub fn count_with_status(conn: &Connection, status: &str) -> AppResult<i64> {
    Ok(conn.query_row(
        "select count(*) from extraction_windows where status = ?1",
        [status],
        |r| r.get(0),
    )?)
}

/// Removes windows at or after `from_index` (their ideas cascade away).
pub fn retire_from(conn: &Connection, conversation_id: i64, from_index: i64) -> AppResult<usize> {
    Ok(conn.execute(
        "delete from extraction_windows where conversation_id = ?1 and window_index >= ?2",
        params![conversation_id, from_index],
    )?)
}

pub fn insert(
    conn: &Connection,
    conversation_id: i64,
    window_index: i64,
    w: &PlannedWindow,
) -> AppResult<i64> {
    let now = now_ts();
    conn.execute(
        "insert into extraction_windows
           (conversation_id, window_index, first_seq, last_seq, part_index, part_count, window_hash, created_at, updated_at)
         values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)",
        params![
            conversation_id,
            window_index,
            w.first_seq,
            w.last_seq,
            w.part_index as i64,
            w.part_count as i64,
            w.hash,
            now
        ],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn set_status(
    conn: &Connection,
    id: i64,
    status: &str,
    batch_id: Option<&str>,
    error: Option<&str>,
) -> AppResult<()> {
    conn.execute(
        "update extraction_windows set status = ?2, batch_id = ?3, error = ?4, updated_at = ?5 where id = ?1",
        params![id, status, batch_id, error, now_ts()],
    )?;
    Ok(())
}

/// Back to pending after a transient failure; fails permanently after `max_attempts`.
pub fn requeue_or_fail(
    conn: &Connection,
    id: i64,
    error: &str,
    max_attempts: i64,
) -> AppResult<bool> {
    conn.execute(
        "update extraction_windows set attempts = attempts + 1, batch_id = null, error = ?2, updated_at = ?3,
                status = case when attempts + 1 >= ?4 then 'failed' else 'pending' end
          where id = ?1",
        params![id, error, now_ts(), max_attempts],
    )?;
    let status: String = conn.query_row(
        "select status from extraction_windows where id = ?1",
        [id],
        |r| r.get(0),
    )?;
    Ok(status == "pending")
}

/// Active-branch messages of a conversation, in order.
pub fn active_messages(conn: &Connection, conversation_id: i64) -> AppResult<Vec<WindowMessage>> {
    let mut stmt = conn.prepare(
        "select id, seq, role, text, created_at from messages
          where conversation_id = ?1 and superseded = 0 order by seq",
    )?;
    let rows = stmt.query_map([conversation_id], |r| {
        Ok(WindowMessage {
            message_id: r.get(0)?,
            seq: r.get(1)?,
            role: r.get(2)?,
            text: r.get(3)?,
            created_at: r.get(4)?,
        })
    })?;
    Ok(rows.collect::<Result<_, _>>()?)
}

/// Conversations whose windows haven't been planned for their current content.
pub fn conversations_needing_plan(conn: &Connection) -> AppResult<Vec<i64>> {
    let mut stmt = conn.prepare(
        "select id from conversations where planned_hash is null or planned_hash != content_hash order by created_at",
    )?;
    let rows = stmt.query_map([], |r| r.get(0))?;
    Ok(rows.collect::<Result<_, _>>()?)
}

pub fn mark_planned(conn: &Connection, conversation_id: i64) -> AppResult<()> {
    conn.execute(
        "update conversations set planned_hash = content_hash where id = ?1",
        [conversation_id],
    )?;
    Ok(())
}
