//! Anthropic API access. `LlmClient` is the seam: the HTTP client in the app, a scripted
//! fake in tests. Methods are blocking; call them from blocking contexts (job handlers).

pub mod fake;
pub mod http;
pub mod types;

use crate::error::AppResult;
use types::{BatchInfo, BatchRequest, BatchResultLine, MessageRequest, MessageResponse};

/// Models whose direct calls opt into server-side refusal fallback.
const FALLBACK_MODELS: &[&str] = &["claude-opus-5-5", "claude-opus-5"];

/// `fallbacks` for a direct call: "default" lets the API re-run a declined request on
/// the model it recommends for that refusal category.
pub fn refusal_fallback(model: &str) -> Option<&'static str> {
    FALLBACK_MODELS.contains(&model).then_some("default")
}

pub trait LlmClient: Send + Sync {
    fn create_message(&self, request: &MessageRequest) -> AppResult<MessageResponse>;
    fn create_batch(&self, requests: &[BatchRequest]) -> AppResult<BatchInfo>;
    fn get_batch(&self, batch_id: &str) -> AppResult<BatchInfo>;
    fn batch_results(&self, batch: &BatchInfo) -> AppResult<Vec<BatchResultLine>>;
    /// Cheap authenticated call (lists models) to confirm the key works.
    fn check_key(&self) -> AppResult<()>;
}
