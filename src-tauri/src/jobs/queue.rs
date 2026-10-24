//! Queue operations on the `jobs` table. All functions take a connection so callers
//! control locking; none of them block for long.

use chrono::{DateTime, Duration, Utc};
use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::Serialize;

use super::{JobPayload, Stage};
use crate::db::{now_ts, ts};
use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, PartialEq)]
pub struct JobRecord {
    pub id: i64,
    pub root_job_id: i64,
    pub payload: JobPayload,
    pub attempts: i64,
    pub max_attempts: i64,
}

impl JobRecord {
    /// Whether the worker will run this job again after `error` (handlers that record
    /// failures on their own rows use this to know when to give up).
    pub fn will_retry(&self, error: &AppError) -> bool {
        error.is_retryable() && self.attempts < self.max_attempts
    }
}

/// A job row as the frontend sees it (`JobProgress` in contract/jobs.ts).
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JobView {
    pub job_id: String,
    pub root_job_id: String,
    pub kind: String,
    /// Kind of the job the pipeline started from ("import", "capture", ...).
    pub root_kind: String,
    pub status: String,
    pub stage: String,
    pub done: i64,
    pub total: i64,
    pub message: Option<String>,
    pub error: Option<String>,
    pub error_code: Option<String>,
    pub updated_at: String,
}

pub enum Enqueued {
    Created(i64),
    /// A job with the same dedupe key is already queued or running.
    Existing(i64),
}

pub fn enqueue(
    conn: &Connection,
    payload: &JobPayload,
    parent: Option<i64>,
) -> AppResult<Enqueued> {
    enqueue_at(conn, payload, parent, Utc::now())
}

/// Enqueues a job that won't be claimed before `run_after`.
pub fn enqueue_at(
    conn: &Connection,
    payload: &JobPayload,
    parent: Option<i64>,
    run_after: chrono::DateTime<Utc>,
) -> AppResult<Enqueued> {
    let key = payload.dedupe_key();
    if let Some(existing) = open_with_key(conn, key.as_deref())? {
        return Ok(Enqueued::Existing(existing));
    }
    let now = now_ts();
    conn.execute(
        "insert into jobs (kind, payload, run_after, parent_job_id, dedupe_key, created_at, updated_at)
         values (?1, ?2, ?3, ?4, ?5, ?6, ?6)",
        params![
            payload.kind().as_str(),
            serde_json::to_string(payload)?,
            ts(run_after),
            parent,
            key,
            now
        ],
    )?;
    let id = conn.last_insert_rowid();
    let root = match parent {
        Some(p) => conn.query_row("select root_job_id from jobs where id = ?1", [p], |r| {
            r.get(0)
        })?,
        None => id,
    };
    conn.execute(
        "update jobs set root_job_id = ?2 where id = ?1",
        params![id, root],
    )?;
    Ok(Enqueued::Created(id))
}

/// A trailing debounce: queues `payload` to run `delay` from now, or pushes the queued
/// job with the same key back to then, but never past `max_wait` after that job was
/// queued and never earlier than it already was. A running job is left alone; it reads
/// the data when it runs.
pub fn enqueue_debounced(
    conn: &Connection,
    payload: &JobPayload,
    delay: Duration,
    max_wait: Duration,
) -> AppResult<Enqueued> {
    let key = payload
        .dedupe_key()
        .ok_or_else(|| AppError::internal("a debounced job needs a dedupe key"))?;
    let open: Option<(i64, String, String, String)> = conn
        .query_row(
            "select id, status, created_at, run_after from jobs
              where dedupe_key = ?1 and status in ('queued', 'running')",
            [&key],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
        )
        .optional()?;
    let now = Utc::now();
    let Some((id, status, created_at, run_after)) = open else {
        return enqueue_at(conn, payload, None, now + delay);
    };
    if status == "running" {
        return Ok(Enqueued::Existing(id));
    }
    let target = (now + delay).min(parse_ts(&created_at)? + max_wait);
    if target > parse_ts(&run_after)? {
        conn.execute(
            "update jobs set run_after = ?2, updated_at = ?3 where id = ?1 and status = 'queued'",
            params![id, ts(target), now_ts()],
        )?;
    }
    Ok(Enqueued::Existing(id))
}

fn parse_ts(value: &str) -> AppResult<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(value)
        .map(|t| t.with_timezone(&Utc))
        .map_err(|e| AppError::internal(format!("unreadable job time {value}: {e}")))
}

/// Kind of a pipeline's root job; None when the row is gone.
pub fn root_kind(conn: &Connection, root_job_id: i64) -> AppResult<Option<String>> {
    Ok(conn
        .query_row("select kind from jobs where id = ?1", [root_job_id], |r| {
            r.get(0)
        })
        .optional()?)
}

fn open_with_key(conn: &Connection, key: Option<&str>) -> AppResult<Option<i64>> {
    let Some(key) = key else { return Ok(None) };
    Ok(conn
        .query_row(
            "select id from jobs where dedupe_key = ?1 and status in ('queued', 'running')",
            [key],
            |r| r.get(0),
        )
        .optional()?)
}

fn record_from_row(row: &Row) -> rusqlite::Result<(i64, i64, String, i64, i64)> {
    Ok((
        row.get(0)?,
        row.get(1)?,
        row.get(2)?,
        row.get(3)?,
        row.get(4)?,
    ))
}

/// Atomically marks the next ready job running and returns it.
pub fn claim_next(conn: &Connection) -> AppResult<Option<JobRecord>> {
    let now = now_ts();
    let row = conn
        .query_row(
            "update jobs set status = 'running', locked_at = ?1, updated_at = ?1, attempts = attempts + 1
              where id = (select id from jobs where status = 'queued' and run_after <= ?1
                          order by priority desc, id asc limit 1)
             returning id, root_job_id, payload, attempts, max_attempts",
            [&now],
            record_from_row,
        )
        .optional()?;
    let Some((id, root_job_id, payload, attempts, max_attempts)) = row else {
        return Ok(None);
    };
    let payload = serde_json::from_str(&payload)
        .map_err(|e| AppError::internal(format!("job {id} has an unreadable payload: {e}")))?;
    Ok(Some(JobRecord {
        id,
        root_job_id,
        payload,
        attempts,
        max_attempts,
    }))
}

pub fn set_progress(
    conn: &Connection,
    id: i64,
    stage: Stage,
    done: u64,
    total: u64,
    message: Option<&str>,
) -> AppResult<()> {
    conn.execute(
        "update jobs set stage = ?2, progress_done = ?3, progress_total = ?4, message = ?5, updated_at = ?6 where id = ?1",
        params![id, stage.as_str(), done as i64, total as i64, message, now_ts()],
    )?;
    Ok(())
}

pub fn complete(conn: &Connection, id: i64, result: Option<&str>) -> AppResult<()> {
    let now = now_ts();
    conn.execute(
        "update jobs set status = 'done', stage = 'done', result = ?2, locked_at = null,
                         updated_at = ?3, finished_at = ?3 where id = ?1",
        params![id, result, now],
    )?;
    Ok(())
}

pub fn fail(conn: &Connection, id: i64, error: &AppError) -> AppResult<()> {
    let now = now_ts();
    conn.execute(
        "update jobs set status = 'failed', stage = 'failed', last_error = ?2, error_code = ?3,
                         locked_at = null, updated_at = ?4, finished_at = ?4 where id = ?1",
        params![id, error.to_string(), error.code(), now],
    )?;
    Ok(())
}

pub fn retry_later(conn: &Connection, id: i64, error: &AppError, delay: Duration) -> AppResult<()> {
    let now = now_ts();
    conn.execute(
        "update jobs set status = 'queued', stage = 'queued', last_error = ?2, error_code = ?3,
                         run_after = ?4, locked_at = null, updated_at = ?5 where id = ?1",
        params![
            id,
            error.to_string(),
            error.code(),
            ts(Utc::now() + delay),
            now
        ],
    )?;
    Ok(())
}

/// Puts a running job back in the queue to run again after `delay`, without counting
/// the run as a failed attempt (used for polling).
pub fn reschedule(conn: &Connection, id: i64, delay: Duration, message: &str) -> AppResult<()> {
    let now = now_ts();
    conn.execute(
        "update jobs set status = 'queued', attempts = max(attempts - 1, 0), run_after = ?2,
                         message = ?3, locked_at = null, updated_at = ?4 where id = ?1",
        params![id, ts(Utc::now() + delay), message, now],
    )?;
    Ok(())
}

/// Cancels a queued or running job row. Returns whether a row changed.
pub fn mark_cancelled(conn: &Connection, id: i64) -> AppResult<bool> {
    let now = now_ts();
    let changed = conn.execute(
        "update jobs set status = 'cancelled', locked_at = null, updated_at = ?2, finished_at = ?2
          where id = ?1 and status in ('queued', 'running')",
        params![id, now],
    )?;
    Ok(changed > 0)
}

/// Failed or cancelled → queued with a fresh attempt budget.
pub fn requeue(conn: &Connection, id: i64) -> AppResult<bool> {
    let now = now_ts();
    let changed = conn.execute(
        "update jobs set status = 'queued', stage = 'queued', attempts = 0, run_after = ?2,
                         last_error = null, error_code = null, updated_at = ?2, finished_at = null
          where id = ?1 and status in ('failed', 'cancelled')",
        params![id, now],
    )?;
    Ok(changed > 0)
}

/// Startup: anything left running by a crash goes back to the queue.
pub fn recover_running(conn: &Connection) -> AppResult<usize> {
    Ok(conn.execute(
        "update jobs set status = 'queued', locked_at = null, updated_at = ?1 where status = 'running'",
        [now_ts()],
    )?)
}

/// Jobs under `root_job_id` that are still queued or running.
pub fn open_in_pipeline(conn: &Connection, root_job_id: i64) -> AppResult<i64> {
    Ok(conn.query_row(
        "select count(*) from jobs where root_job_id = ?1 and status in ('queued', 'running')",
        [root_job_id],
        |r| r.get(0),
    )?)
}

pub fn view(conn: &Connection, id: i64) -> AppResult<Option<JobView>> {
    Ok(conn
        .query_row(&format!("{VIEW_SELECT} where id = ?1"), [id], view_from_row)
        .optional()?)
}

/// Open jobs plus the most recent finished ones, newest first.
pub fn recent(conn: &Connection, limit: u32) -> AppResult<Vec<JobView>> {
    let mut stmt = conn.prepare(&format!(
        "{VIEW_SELECT} order by (status in ('queued', 'running')) desc, id desc limit ?1"
    ))?;
    let rows = stmt.query_map([limit], view_from_row)?;
    Ok(rows.collect::<Result<_, _>>()?)
}

const VIEW_SELECT: &str =
    "select id, root_job_id, kind, status, stage, progress_done, progress_total,
            message, last_error, error_code, updated_at,
            coalesce((select r.kind from jobs r where r.id = jobs.root_job_id), kind)
       from jobs";

fn view_from_row(r: &Row) -> rusqlite::Result<JobView> {
    Ok(JobView {
        job_id: r.get::<_, i64>(0)?.to_string(),
        root_job_id: r.get::<_, Option<i64>>(1)?.unwrap_or_default().to_string(),
        kind: r.get(2)?,
        root_kind: r.get(11)?,
        status: r.get(3)?,
        stage: r.get(4)?,
        done: r.get(5)?,
        total: r.get(6)?,
        message: r.get(7)?,
        error: r.get(8)?,
        error_code: r.get(9)?,
        updated_at: r.get(10)?,
    })
}
