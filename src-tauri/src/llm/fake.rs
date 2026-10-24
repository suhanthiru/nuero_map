//! A scripted `LlmClient` for tests: replies are produced by a closure over the request,
//! and batches complete after a configurable number of polls.

use std::collections::HashMap;
use std::sync::Mutex;

use super::types::{
    BatchInfo, BatchOutcome, BatchRequest, BatchResultLine, MessageRequest, MessageResponse,
    RequestCounts,
};
use super::LlmClient;
use crate::error::{AppError, AppResult};

type Responder = dyn Fn(&MessageRequest) -> AppResult<String> + Send + Sync;

struct FakeBatch {
    requests: Vec<BatchRequest>,
    polls_left: u32,
}

pub struct FakeLlm {
    respond: Box<Responder>,
    batches: Mutex<HashMap<String, FakeBatch>>,
    polls_before_end: u32,
    calls: Mutex<Vec<MessageRequest>>,
}

impl FakeLlm {
    /// `respond` returns the text of Claude's reply for a request.
    pub fn new(
        respond: impl Fn(&MessageRequest) -> AppResult<String> + Send + Sync + 'static,
    ) -> Self {
        Self {
            respond: Box::new(respond),
            batches: Mutex::new(HashMap::new()),
            polls_before_end: 1,
            calls: Mutex::new(Vec::new()),
        }
    }

    pub fn with_polls_before_end(mut self, polls: u32) -> Self {
        self.polls_before_end = polls;
        self
    }

    pub fn calls(&self) -> Vec<MessageRequest> {
        self.calls.lock().map(|c| c.clone()).unwrap_or_default()
    }

    fn reply(&self, request: &MessageRequest) -> AppResult<MessageResponse> {
        if let Ok(mut calls) = self.calls.lock() {
            calls.push(request.clone());
        }
        let text = (self.respond)(request)?;
        let body = serde_json::json!({
            "id": "msg_fake",
            "model": request.model,
            "content": [{"type": "text", "text": text}],
            "stop_reason": "end_turn",
            "usage": {"input_tokens": 100, "output_tokens": 20, "cache_read_input_tokens": 4000}
        });
        Ok(serde_json::from_value(body)?)
    }

    fn info(id: &str, ended: bool, count: u64) -> BatchInfo {
        BatchInfo {
            id: id.to_owned(),
            processing_status: if ended { "ended" } else { "in_progress" }.to_owned(),
            request_counts: RequestCounts {
                processing: if ended { 0 } else { count },
                succeeded: if ended { count } else { 0 },
                ..RequestCounts::default()
            },
            results_url: None,
            expires_at: None,
        }
    }
}

impl LlmClient for FakeLlm {
    fn create_message(&self, request: &MessageRequest) -> AppResult<MessageResponse> {
        self.reply(request)
    }

    fn create_batch(&self, requests: &[BatchRequest]) -> AppResult<BatchInfo> {
        let mut batches = self
            .batches
            .lock()
            .map_err(|_| AppError::internal("fake lock"))?;
        let id = format!("msgbatch_fake_{}", batches.len() + 1);
        batches.insert(
            id.clone(),
            FakeBatch {
                requests: requests.to_vec(),
                polls_left: self.polls_before_end,
            },
        );
        Ok(Self::info(&id, false, requests.len() as u64))
    }

    fn get_batch(&self, batch_id: &str) -> AppResult<BatchInfo> {
        let mut batches = self
            .batches
            .lock()
            .map_err(|_| AppError::internal("fake lock"))?;
        let batch = batches.get_mut(batch_id).ok_or_else(|| AppError::Api {
            status: 404,
            message: "no such batch".into(),
        })?;
        batch.polls_left = batch.polls_left.saturating_sub(1);
        Ok(Self::info(
            batch_id,
            batch.polls_left == 0,
            batch.requests.len() as u64,
        ))
    }

    fn batch_results(&self, batch: &BatchInfo) -> AppResult<Vec<BatchResultLine>> {
        let requests = {
            let batches = self
                .batches
                .lock()
                .map_err(|_| AppError::internal("fake lock"))?;
            batches
                .get(&batch.id)
                .map(|b| b.requests.clone())
                .unwrap_or_default()
        };
        // Reverse to prove callers key by custom_id rather than position.
        requests
            .iter()
            .rev()
            .map(|r| {
                let result = match self.reply(&r.params) {
                    Ok(message) => BatchOutcome::Succeeded { message },
                    Err(_) => BatchOutcome::Expired,
                };
                Ok(BatchResultLine {
                    custom_id: r.custom_id.clone(),
                    result,
                })
            })
            .collect()
    }

    fn check_key(&self) -> AppResult<()> {
        Ok(())
    }
}
