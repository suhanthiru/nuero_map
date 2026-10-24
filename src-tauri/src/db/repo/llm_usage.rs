use rusqlite::{params, Connection};

use crate::db::now_ts;
use crate::error::AppResult;
use crate::llm::types::MessageResponse;

pub fn record(
    conn: &Connection,
    purpose: &str,
    batch_id: Option<&str>,
    response: &MessageResponse,
) -> AppResult<()> {
    let u = &response.usage;
    conn.execute(
        "insert into llm_calls
           (purpose, model, batch_id, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, created_at)
         values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            purpose,
            response.model,
            batch_id,
            u.input_tokens as i64,
            u.output_tokens as i64,
            u.cache_read_input_tokens as i64,
            u.cache_creation_input_tokens as i64,
            now_ts()
        ],
    )?;
    Ok(())
}

pub fn record_batch(conn: &Connection, batch_id: &str, request_count: usize) -> AppResult<()> {
    conn.execute(
        "insert or ignore into llm_batches (batch_id, status, request_count, submitted_at) values (?1, 'in_progress', ?2, ?3)",
        params![batch_id, request_count as i64, now_ts()],
    )?;
    Ok(())
}

pub fn mark_batch_ended(conn: &Connection, batch_id: &str) -> AppResult<()> {
    conn.execute(
        "update llm_batches set status = 'ended', ended_at = ?2, results_fetched = 1 where batch_id = ?1",
        params![batch_id, now_ts()],
    )?;
    Ok(())
}
