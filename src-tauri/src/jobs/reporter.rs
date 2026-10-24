//! Progress reporting for a running job: throttled, persisted, and emitted.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use super::{JobKind, Stage};
use crate::config::PROGRESS_THROTTLE_MS;
use crate::db::{now_ts, Db};
use crate::events::{self, EventSink, JobProgressEvent};

pub struct JobReporter {
    db: Db,
    sink: Arc<dyn EventSink>,
    job_id: i64,
    root_job_id: i64,
    kind: JobKind,
    root_kind: String,
    cancel: Arc<AtomicBool>,
    last: Mutex<Option<(Stage, Instant)>>,
}

impl JobReporter {
    pub fn new(
        db: Db,
        sink: Arc<dyn EventSink>,
        job_id: i64,
        root_job_id: i64,
        kind: JobKind,
        root_kind: String,
        cancel: Arc<AtomicBool>,
    ) -> Self {
        Self {
            db,
            sink,
            job_id,
            root_job_id,
            kind,
            root_kind,
            cancel,
            last: Mutex::new(None),
        }
    }

    pub fn root_kind(&self) -> &str {
        &self.root_kind
    }

    pub fn is_cancelled(&self) -> bool {
        self.cancel.load(Ordering::SeqCst)
    }

    /// Emits at most every PROGRESS_THROTTLE_MS per stage; stage changes always emit.
    pub fn progress(&self, stage: Stage, done: u64, total: u64, message: Option<String>) {
        if !self.should_emit(stage) {
            return;
        }
        self.force(stage, done, total, message);
    }

    /// Emits and persists regardless of throttling (stage boundaries, completion).
    pub fn force(&self, stage: Stage, done: u64, total: u64, message: Option<String>) {
        let persisted = self.db.call_blocking(|c| {
            super::queue::set_progress(c, self.job_id, stage, done, total, message.as_deref())
        });
        if let Err(e) = persisted {
            tracing::warn!(job = self.job_id, error = %e, "could not persist job progress");
        }
        events::emit(
            self.sink.as_ref(),
            events::JOB_PROGRESS,
            &JobProgressEvent {
                job_id: self.job_id.to_string(),
                root_job_id: self.root_job_id.to_string(),
                kind: self.kind.as_str().to_owned(),
                root_kind: self.root_kind.clone(),
                stage: stage.as_str().to_owned(),
                done,
                total,
                message,
                updated_at: now_ts(),
            },
        );
    }

    fn should_emit(&self, stage: Stage) -> bool {
        let Ok(mut last) = self.last.lock() else {
            return true;
        };
        let now = Instant::now();
        let due = match *last {
            Some((prev, at)) => {
                prev != stage
                    || now.duration_since(at) >= Duration::from_millis(PROGRESS_THROTTLE_MS)
            }
            None => true,
        };
        if due {
            *last = Some((stage, now));
        }
        due
    }
}
