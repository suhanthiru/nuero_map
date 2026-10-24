//! Idea extraction: plan windows, send them to Claude (directly or via Message Batches),
//! validate the output, and store ideas linked to their source messages.

pub mod parse;
pub mod plan;
pub mod prompt;
pub mod request;
pub mod windows;

use std::collections::HashMap;

use crate::config::llm::BATCH_MAX_REQUESTS;
use crate::db::repo::{ideas, llm_usage, windows as window_repo};
use crate::db::Db;
use crate::error::AppResult;
use crate::llm::types::{BatchInfo, BatchOutcome, BatchRequest, MessageResponse};
use crate::llm::LlmClient;
use request::{build_request, custom_id, window_id_from_custom_id, WindowInput};
use windows::WindowMessage;

/// Windows get this many tries (transient failures) before they're marked failed.
pub const MAX_WINDOW_ATTEMPTS: i64 = 3;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WindowOutcome {
    Done { ideas: usize, dropped: usize },
    Failed,
    Requeued,
}

fn failure_reason(response: &MessageResponse) -> Option<&'static str> {
    match response.stop_reason.as_deref() {
        Some("refusal") => Some("the model declined this window"),
        Some("max_tokens") => Some("extraction output hit max_tokens"),
        _ => None,
    }
}

/// Validates a response for one window and stores its ideas (or marks it failed).
pub fn apply_response(
    db: &Db,
    input: &WindowInput,
    messages: &[WindowMessage],
    response: &MessageResponse,
    batch_id: Option<&str>,
) -> AppResult<WindowOutcome> {
    let window_id = input.window_id;
    db.call_blocking(|c| llm_usage::record(c, "extract", batch_id, response))?;
    if let Some(reason) = failure_reason(response) {
        db.call_blocking(|c| {
            window_repo::set_status(c, window_id, "failed", batch_id, Some(reason))
        })?;
        return Ok(WindowOutcome::Failed);
    }
    let full_text: HashMap<i64, String> = messages
        .iter()
        .map(|m| (m.message_id, m.text.clone()))
        .collect();
    match parse::parse_extraction(&response.text(), &input.parts, &full_text) {
        Ok((valid, dropped)) => {
            db.call_blocking(|c| {
                let tx = c.transaction()?;
                let conversation_id =
                    window_repo::get(&tx, window_id)?.map_or(0, |w| w.conversation_id);
                ideas::replace_for_window(&tx, window_id, conversation_id, &valid)?;
                window_repo::set_status(&tx, window_id, "done", batch_id, None)?;
                tx.commit()?;
                Ok(())
            })?;
            Ok(WindowOutcome::Done {
                ideas: valid.len(),
                dropped,
            })
        }
        Err(e) => {
            let reason = e.to_string();
            db.call_blocking(|c| {
                window_repo::set_status(c, window_id, "failed", batch_id, Some(&reason))
            })?;
            Ok(WindowOutcome::Failed)
        }
    }
}

/// Blocking. Extracts one window with a direct Messages API call.
/// Auth errors propagate (abort the run); transient errors requeue the window.
pub fn extract_direct(db: &Db, llm: &dyn LlmClient, window_id: i64) -> AppResult<WindowOutcome> {
    let (input, messages) = db.call_blocking(|c| plan::window_input(c, window_id))?;
    match llm.create_message(&build_request(&input)) {
        Ok(response) => apply_response(db, &input, &messages, &response, None),
        Err(e) if e.is_retryable() => {
            let pending = db.call_blocking(|c| {
                window_repo::requeue_or_fail(c, window_id, &e.to_string(), MAX_WINDOW_ATTEMPTS)
            })?;
            Ok(if pending {
                WindowOutcome::Requeued
            } else {
                WindowOutcome::Failed
            })
        }
        Err(e) => Err(e),
    }
}

/// Blocking. Submits windows as Message Batches (50% cheaper). Returns the batch ids.
pub fn submit_batches(db: &Db, llm: &dyn LlmClient, window_ids: &[i64]) -> AppResult<Vec<String>> {
    let mut batch_ids = Vec::new();
    for chunk in window_ids.chunks(BATCH_MAX_REQUESTS) {
        let requests = chunk
            .iter()
            .map(|&id| {
                let (input, _) = db.call_blocking(|c| plan::window_input(c, id))?;
                Ok(BatchRequest {
                    custom_id: custom_id(id),
                    params: build_request(&input),
                })
            })
            .collect::<AppResult<Vec<_>>>()?;
        let info = llm.create_batch(&requests)?;
        db.call_blocking(|c| {
            let tx = c.transaction()?;
            llm_usage::record_batch(&tx, &info.id, requests.len())?;
            for &id in chunk {
                window_repo::set_status(&tx, id, "submitted", Some(&info.id), None)?;
            }
            tx.commit()?;
            Ok(())
        })?;
        batch_ids.push(info.id);
    }
    Ok(batch_ids)
}

#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub struct BatchReport {
    pub done: usize,
    pub failed: usize,
    pub requeued: usize,
    pub ideas: usize,
}

impl BatchReport {
    fn add(&mut self, outcome: WindowOutcome) {
        match outcome {
            WindowOutcome::Done { ideas, .. } => {
                self.done += 1;
                self.ideas += ideas;
            }
            WindowOutcome::Failed => self.failed += 1,
            WindowOutcome::Requeued => self.requeued += 1,
        }
    }
}

fn apply_outcome(
    db: &Db,
    window_id: i64,
    batch_id: &str,
    outcome: &BatchOutcome,
) -> AppResult<WindowOutcome> {
    match outcome {
        BatchOutcome::Succeeded { message } => {
            let (input, messages) = db.call_blocking(|c| plan::window_input(c, window_id))?;
            apply_response(db, &input, &messages, message, Some(batch_id))
        }
        BatchOutcome::Errored { .. } if outcome.is_invalid_request() => {
            db.call_blocking(|c| {
                window_repo::set_status(
                    c,
                    window_id,
                    "failed",
                    Some(batch_id),
                    Some("invalid request"),
                )
            })?;
            Ok(WindowOutcome::Failed)
        }
        other => {
            let reason = format!("batch result: {other:?}")
                .chars()
                .take(200)
                .collect::<String>();
            let pending = db.call_blocking(|c| {
                window_repo::requeue_or_fail(c, window_id, &reason, MAX_WINDOW_ATTEMPTS)
            })?;
            Ok(if pending {
                WindowOutcome::Requeued
            } else {
                WindowOutcome::Failed
            })
        }
    }
}

/// Blocking. Stores the results of an ended batch. Results arrive in any order; each is
/// matched to its window by custom_id.
pub fn apply_batch_results(
    db: &Db,
    llm: &dyn LlmClient,
    batch: &BatchInfo,
) -> AppResult<BatchReport> {
    let lines = llm.batch_results(batch)?;
    let mut report = BatchReport::default();
    for line in &lines {
        let Some(window_id) = window_id_from_custom_id(&line.custom_id) else {
            tracing::warn!(custom_id = %line.custom_id, "ignoring unknown batch result");
            continue;
        };
        if db
            .call_blocking(|c| window_repo::get(c, window_id))?
            .is_none()
        {
            continue; // the window was retired by a re-import while the batch ran
        }
        report.add(apply_outcome(db, window_id, &batch.id, &line.result)?);
    }
    let missing = db.call_blocking(|c| window_repo::submitted_in_batch(c, &batch.id))?;
    for window_id in missing {
        let pending = db.call_blocking(|c| {
            window_repo::requeue_or_fail(
                c,
                window_id,
                "missing from batch results",
                MAX_WINDOW_ATTEMPTS,
            )
        })?;
        report.add(if pending {
            WindowOutcome::Requeued
        } else {
            WindowOutcome::Failed
        });
    }
    db.call_blocking(|c| llm_usage::mark_batch_ended(c, &batch.id))?;
    Ok(report)
}
