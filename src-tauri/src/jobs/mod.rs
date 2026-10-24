//! Durable background jobs: a SQLite-backed queue drained by one worker.

pub mod handlers;
pub mod queue;
pub mod reporter;
pub mod worker;

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};
use tokio::sync::Notify;

use crate::ingest::detect::RequestedSource;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum JobKind {
    Import,
    Extract,
    PollBatch,
    Assign,
    Link,
    Review,
    Capture,
}

impl JobKind {
    pub fn as_str(self) -> &'static str {
        match self {
            JobKind::Import => "import",
            JobKind::Extract => "extract",
            JobKind::PollBatch => "poll_batch",
            JobKind::Assign => "assign",
            JobKind::Link => "link",
            JobKind::Review => "review",
            JobKind::Capture => "capture",
        }
    }
}

/// Stages shared with the frontend (`JobStage` in contract/jobs.ts).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Stage {
    Queued,
    Parsing,
    Extracting,
    Embedding,
    Assigning,
    Linking,
    Synthesizing,
    Done,
    Failed,
}

impl Stage {
    pub fn as_str(self) -> &'static str {
        match self {
            Stage::Queued => "queued",
            Stage::Parsing => "parsing",
            Stage::Extracting => "extracting",
            Stage::Embedding => "embedding",
            Stage::Assigning => "assigning",
            Stage::Linking => "linking",
            Stage::Synthesizing => "synthesizing",
            Stage::Done => "done",
            Stage::Failed => "failed",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum JobPayload {
    Import {
        path: String,
        source: RequestedSource,
        /// From the estimate step, so parsing progress can show a real total.
        #[serde(default)]
        expected_conversations: Option<u64>,
    },
    /// Plan windows for changed conversations and extract every pending window.
    Extract,
    /// Check a submitted Message Batch; store its results once it has ended.
    PollBatch { batch_id: String },
    /// Embed new ideas and put each into a topic.
    Assign,
    /// Rebuild connections and refresh how alive every topic is.
    Link,
    /// Write a weekly review's questions.
    ReviewGenerate { review_id: i64 },
    /// Grade a submitted weekly review and write its study guide.
    ReviewGrade { review_id: i64 },
    /// Debounced after Gemini captures: start extraction once chatting goes quiet.
    Capture,
}

impl JobPayload {
    pub fn kind(&self) -> JobKind {
        match self {
            JobPayload::Import { .. } => JobKind::Import,
            JobPayload::Extract => JobKind::Extract,
            JobPayload::PollBatch { .. } => JobKind::PollBatch,
            JobPayload::Assign => JobKind::Assign,
            JobPayload::Link => JobKind::Link,
            JobPayload::ReviewGenerate { .. } | JobPayload::ReviewGrade { .. } => JobKind::Review,
            JobPayload::Capture => JobKind::Capture,
        }
    }

    /// At most one queued/running job per key.
    pub fn dedupe_key(&self) -> Option<String> {
        match self {
            JobPayload::Import { .. } => Some("import".to_owned()),
            JobPayload::Extract => Some("extract".to_owned()),
            JobPayload::PollBatch { batch_id } => Some(format!("poll:{batch_id}")),
            JobPayload::Assign => Some("assign".to_owned()),
            JobPayload::Link => Some("link".to_owned()),
            JobPayload::ReviewGenerate { review_id } => {
                Some(format!("review-generate:{review_id}"))
            }
            JobPayload::ReviewGrade { review_id } => Some(format!("review-grade:{review_id}")),
            // Its own key, so captures never delay an import's extraction.
            JobPayload::Capture => Some("capture".to_owned()),
        }
    }
}

/// Wakes the worker and tracks cancel flags for running jobs. Cheap to clone.
#[derive(Clone, Default)]
pub struct JobHandle {
    notify: Arc<Notify>,
    cancels: Arc<Mutex<HashMap<i64, Arc<AtomicBool>>>>,
}

impl JobHandle {
    pub fn wake(&self) {
        self.notify.notify_one();
    }

    pub(crate) async fn wait(&self) {
        self.notify.notified().await;
    }

    pub(crate) fn register(&self, job_id: i64) -> Arc<AtomicBool> {
        let flag = Arc::new(AtomicBool::new(false));
        if let Ok(mut map) = self.cancels.lock() {
            map.insert(job_id, flag.clone());
        }
        flag
    }

    pub(crate) fn unregister(&self, job_id: i64) {
        if let Ok(mut map) = self.cancels.lock() {
            map.remove(&job_id);
        }
    }

    /// Signals a running job to stop. Returns false when it isn't running here.
    pub fn cancel_running(&self, job_id: i64) -> bool {
        self.cancels
            .lock()
            .ok()
            .and_then(|map| map.get(&job_id).cloned())
            .map(|flag| flag.store(true, Ordering::SeqCst))
            .is_some()
    }
}
