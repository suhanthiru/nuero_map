//! Backend → frontend events. Names and payload keys match `Events` in
//! `src/api/contract/commands.ts`.

use std::sync::Mutex;

use serde::Serialize;
use serde_json::Value;

pub const JOB_PROGRESS: &str = "job_progress";
pub const JOB_FINISHED: &str = "job_finished";
pub const TOPICS_CHANGED: &str = "topics_changed";
pub const CAPTURE_RECEIVED: &str = "capture_received";

/// Where events go. Tauri in the app; a recorder in tests.
pub trait EventSink: Send + Sync {
    fn emit(&self, event: &str, payload: Value);
}

pub fn emit<T: Serialize>(sink: &dyn EventSink, event: &str, payload: &T) {
    match serde_json::to_value(payload) {
        Ok(value) => sink.emit(event, value),
        Err(e) => tracing::warn!(event, error = %e, "could not serialize event"),
    }
}

pub struct TauriSink(pub tauri::AppHandle);

impl EventSink for TauriSink {
    fn emit(&self, event: &str, payload: Value) {
        use tauri::Emitter;
        if let Err(e) = self.0.emit(event, payload) {
            tracing::warn!(event, error = %e, "could not emit event");
        }
    }
}

/// Keeps every event for assertions.
#[derive(Default)]
pub struct RecordingSink {
    events: Mutex<Vec<(String, Value)>>,
}

impl RecordingSink {
    pub fn events(&self) -> Vec<(String, Value)> {
        self.events.lock().map(|e| e.clone()).unwrap_or_default()
    }

    pub fn named(&self, event: &str) -> Vec<Value> {
        self.events()
            .into_iter()
            .filter(|(name, _)| name == event)
            .map(|(_, v)| v)
            .collect()
    }
}

impl EventSink for RecordingSink {
    fn emit(&self, event: &str, payload: Value) {
        if let Ok(mut events) = self.events.lock() {
            events.push((event.to_owned(), payload));
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JobProgressEvent {
    pub job_id: String,
    pub root_job_id: String,
    pub kind: String,
    pub root_kind: String,
    pub stage: String,
    pub done: u64,
    pub total: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JobFinishedEvent {
    pub job_id: String,
    pub root_job_id: String,
    pub kind: String,
    pub root_kind: String,
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_code: Option<String>,
    /// No other job in this pipeline is still queued or running.
    pub pipeline_done: bool,
}

/// A Gemini capture changed a stored conversation.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureReceivedEvent {
    pub conversation_id: String,
    pub new_turns: u64,
}
