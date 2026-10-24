//! Keeps each conversation's extraction windows in sync with its current messages.

use rusqlite::Connection;

use super::request::WindowInput;
use super::windows::{context_from, plan, tail_parts, valid_prefix, Part, WindowMessage};
use crate::db::repo::{conversations, windows};
use crate::error::{AppError, AppResult};

#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub struct PlanReport {
    pub conversations: usize,
    pub windows_added: usize,
    pub windows_retired: usize,
}

/// Plans one conversation: keeps valid leading windows, retires the rest, adds new ones.
pub fn plan_conversation(conn: &Connection, conversation_id: i64) -> AppResult<(usize, usize)> {
    let messages = windows::active_messages(conn, conversation_id)?;
    let stored = windows::for_conversation(conn, conversation_id)?;
    let existing: Vec<_> = stored.iter().map(|w| w.as_existing()).collect();
    let keep = valid_prefix(&existing, &messages);
    let retired = match stored.get(keep) {
        Some(first_invalid) => {
            windows::retire_from(conn, conversation_id, first_invalid.window_index)?
        }
        None => 0,
    };
    let head = match stored.first().filter(|_| keep > 0) {
        Some(first) => plan_head(conn, conversation_id, &messages, first.first_seq, first.window_index)?,
        None => 0,
    };
    let (remaining, lead_in, next_index): (Vec<WindowMessage>, Vec<Part>, i64) =
        match keep.checked_sub(1).map(|i| &stored[i]) {
            Some(last) => (
                messages
                    .iter()
                    .filter(|m| m.seq > last.last_seq)
                    .cloned()
                    .collect(),
                tail_parts(&messages, last.last_seq),
                last.window_index + 1,
            ),
            None => (messages, Vec::new(), 0),
        };
    let planned = plan(&remaining, &lead_in);
    for (offset, window) in planned.iter().enumerate() {
        windows::insert(conn, conversation_id, next_index + offset as i64, window)?;
    }
    windows::mark_planned(conn, conversation_id)?;
    Ok((head + planned.len(), retired))
}

/// Messages placed before the first kept window (older turns a Gemini capture loaded
/// later) get windows of their own, indexed below it, so the kept ones stay untouched.
fn plan_head(
    conn: &Connection,
    conversation_id: i64,
    messages: &[WindowMessage],
    first_seq: i64,
    first_index: i64,
) -> AppResult<usize> {
    let head: Vec<WindowMessage> = messages
        .iter()
        .filter(|m| m.seq < first_seq)
        .cloned()
        .collect();
    let planned = plan(&head, &[]);
    let start = first_index - planned.len() as i64;
    for (offset, window) in planned.iter().enumerate() {
        windows::insert(conn, conversation_id, start + offset as i64, window)?;
    }
    Ok(planned.len())
}

/// Plans every conversation whose content changed since it was last planned.
pub fn plan_pending(conn: &mut Connection) -> AppResult<PlanReport> {
    let ids = windows::conversations_needing_plan(conn)?;
    let tx = conn.transaction()?;
    let mut report = PlanReport::default();
    for id in ids {
        let (added, retired) = plan_conversation(&tx, id)?;
        report.conversations += 1;
        report.windows_added += added;
        report.windows_retired += retired;
    }
    tx.commit()?;
    Ok(report)
}

/// Rebuilds the parts (and read-only context) of a stored window for rendering.
pub fn window_input(
    conn: &Connection,
    window_id: i64,
) -> AppResult<(WindowInput, Vec<WindowMessage>)> {
    let window = windows::get(conn, window_id)?
        .ok_or_else(|| AppError::NotFound(format!("window {window_id}")))?;
    let header = conversations::header(conn, window.conversation_id)?
        .ok_or_else(|| AppError::NotFound(format!("conversation {}", window.conversation_id)))?;
    let messages = windows::active_messages(conn, window.conversation_id)?;
    let in_range: Vec<WindowMessage> = messages
        .iter()
        .filter(|m| m.seq >= window.first_seq && m.seq <= window.last_seq)
        .cloned()
        .collect();
    let parts: Vec<Part> = plan(&in_range, &[])
        .into_iter()
        .flat_map(|w| w.parts)
        .filter(|p| window.part_count == 1 || p.part_index == window.part_index)
        .collect();
    // Empty for a chat's first window; head windows can sit before index 0.
    let context = context_from(&tail_parts(&messages, window.first_seq - 1));
    let input = WindowInput {
        window_id,
        conversation_title: header.title,
        source: header.source,
        context,
        parts,
    };
    Ok((input, in_range))
}
