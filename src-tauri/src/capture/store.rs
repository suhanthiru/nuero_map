//! Writes a validated capture: merge it into the stored conversation, then queue the
//! debounced extraction, all in one transaction.

use chrono::{DateTime, Duration, Utc};
use rusqlite::Connection;

use super::merge::merge;
use super::payload::Capture;
use crate::config::capture::{DEBOUNCE_SECS, MAX_WAIT_SECS};
use crate::db::repo::messages::{self, TimeSource};
use crate::db::repo::conversations;
use crate::db::ts;
use crate::error::AppResult;
use crate::ingest::fingerprint::content_hash;
use crate::ingest::model::{derive_title, NormalizedConversation, Source};
use crate::jobs::queue;
use crate::jobs::JobPayload;

const UNTITLED: &str = "Gemini chat";

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Stored {
    pub conversation_id: Option<i64>,
    /// Rows added to the conversation (new turns, not revived drafts).
    pub new_turns: usize,
    /// Messages or title changed; false means nothing was written.
    pub changed: bool,
    /// Stored turns were replaced (a regenerate or an edit).
    pub branch_changed: bool,
}

pub fn store(conn: &mut Connection, capture: &Capture, now: DateTime<Utc>) -> AppResult<Stored> {
    let tx = conn.transaction()?;
    let found = conversations::find(&tx, Source::Gemini, &capture.source_id)?;
    let (stored, old_title) = match &found {
        Some(f) => (
            messages::active_branch(&tx, f.id)?,
            conversations::header(&tx, f.id)?.map(|h| h.title),
        ),
        None => (Vec::new(), None),
    };
    let merged = merge(&stored, &capture.turns, capture.from_start, now);
    let (Some(created_at), Some(updated_at)) = (
        merged.messages.first().map(|m| m.created_at),
        merged.messages.iter().map(|m| m.created_at).max(),
    ) else {
        return Ok(Stored::default());
    };
    let title = capture
        .title
        .clone()
        .or(old_title.clone())
        .unwrap_or_else(|| derive_title(&merged.messages, UNTITLED));
    let mut conv = NormalizedConversation {
        source: Source::Gemini,
        source_id: capture.source_id.clone(),
        title,
        url: Some(capture.url.clone()),
        created_at,
        updated_at,
        updated_marker: String::new(),
        messages: merged.messages,
    };
    let hash = content_hash(&conv);
    conv.updated_marker = hash.clone();
    let content_changed = found.as_ref().map_or(true, |f| f.content_hash != hash);
    if !content_changed && old_title.as_deref() == Some(conv.title.as_str()) {
        return Ok(Stored {
            conversation_id: found.map(|f| f.id),
            ..Stored::default()
        });
    }

    let now_text = ts(now);
    let id = match &found {
        Some(f) => {
            conversations::update(&tx, f.id, &conv, &hash, &now_text)?;
            f.id
        }
        None => conversations::insert(&tx, &conv, &hash, &now_text)?,
    };
    let new_turns = messages::sync_branch(&tx, id, &conv.messages, TimeSource::Capture)?;
    if content_changed {
        queue::enqueue_debounced(
            &tx,
            &JobPayload::Capture,
            Duration::seconds(DEBOUNCE_SECS),
            Duration::seconds(MAX_WAIT_SECS),
        )?;
    }
    tx.commit()?;
    Ok(Stored {
        conversation_id: Some(id),
        new_turns,
        changed: true,
        branch_changed: merged.branch_changed,
    })
}
