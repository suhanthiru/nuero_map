//! The single background worker: claim a job, run its handler, record the outcome.

use std::sync::Arc;
use std::time::Duration;

use super::handlers::{self, JobContext, JobOutcome};
use super::queue::{self, JobRecord};
use super::reporter::JobReporter;
use super::{JobHandle, Stage};
use crate::config::{RETRY_BASE_SECS, RETRY_MAX_SECS, WORKER_IDLE_POLL_SECS};
use crate::error::{AppError, AppResult};
use crate::events::{self, JobFinishedEvent};

pub struct Worker {
    ctx: JobContext,
    handle: JobHandle,
}

fn backoff(attempt: i64) -> chrono::Duration {
    let exp = u32::try_from(attempt.saturating_sub(1))
        .unwrap_or(0)
        .min(16);
    let secs = RETRY_BASE_SECS
        .saturating_mul(1_i64 << exp)
        .min(RETRY_MAX_SECS);
    chrono::Duration::seconds(secs)
}

impl Worker {
    pub fn new(ctx: JobContext, handle: JobHandle) -> Self {
        Self { ctx, handle }
    }

    /// Requeue jobs a previous crash left running. Call once at startup.
    pub fn recover(&self) -> AppResult<usize> {
        let n = self.ctx.db.call_blocking(|c| queue::recover_running(c))?;
        if n > 0 {
            tracing::info!(jobs = n, "requeued jobs interrupted by a previous run");
        }
        Ok(n)
    }

    /// Blocking. Runs at most one ready job; returns whether one ran.
    pub fn tick(&self) -> AppResult<bool> {
        let Some(job) = self.ctx.db.call_blocking(|c| queue::claim_next(c))? else {
            return Ok(false);
        };
        let kind = job.payload.kind();
        let root_kind = self
            .ctx
            .db
            .call_blocking(|c| queue::root_kind(c, job.root_job_id))?
            .unwrap_or_else(|| kind.as_str().to_owned());
        let cancel = self.handle.register(job.id);
        let reporter = JobReporter::new(
            self.ctx.db.clone(),
            self.ctx.sink.clone(),
            job.id,
            job.root_job_id,
            kind,
            root_kind,
            cancel,
        );
        tracing::info!(
            job = job.id,
            kind = kind.as_str(),
            attempt = job.attempts,
            "job started"
        );
        let outcome = handlers::run(&self.ctx, &job, &reporter);
        self.handle.unregister(job.id);
        self.finish(&job, &reporter, outcome)?;
        Ok(true)
    }

    fn finish(
        &self,
        job: &JobRecord,
        reporter: &JobReporter,
        outcome: AppResult<JobOutcome>,
    ) -> AppResult<()> {
        let db = &self.ctx.db;
        match outcome {
            Ok(JobOutcome::Reschedule {
                after_secs,
                message,
            }) => {
                db.call_blocking(|c| {
                    queue::reschedule(c, job.id, chrono::Duration::seconds(after_secs), &message)
                })?;
                Ok(())
            }
            Ok(JobOutcome::Done(result)) => {
                db.call_blocking(|c| queue::complete(c, job.id, result.as_deref()))?;
                reporter.force(Stage::Done, 1, 1, None);
                self.announce(job, reporter, None)
            }
            Err(AppError::Cancelled) => {
                db.call_blocking(|c| queue::mark_cancelled(c, job.id))?;
                self.announce(job, reporter, Some(&AppError::Cancelled))
            }
            Err(e) if job.will_retry(&e) => {
                tracing::warn!(job = job.id, error = %e, "job failed; will retry");
                db.call_blocking(|c| queue::retry_later(c, job.id, &e, backoff(job.attempts)))?;
                reporter.force(Stage::Queued, 0, 0, Some(format!("retrying: {e}")));
                Ok(())
            }
            Err(e) => {
                tracing::error!(job = job.id, error = %e, "job failed");
                db.call_blocking(|c| queue::fail(c, job.id, &e))?;
                self.announce(job, reporter, Some(&e))
            }
        }
    }

    fn announce(
        &self,
        job: &JobRecord,
        reporter: &JobReporter,
        error: Option<&AppError>,
    ) -> AppResult<()> {
        let open = self
            .ctx
            .db
            .call_blocking(|c| queue::open_in_pipeline(c, job.root_job_id))?;
        events::emit(
            self.ctx.sink.as_ref(),
            events::JOB_FINISHED,
            &JobFinishedEvent {
                job_id: job.id.to_string(),
                root_job_id: job.root_job_id.to_string(),
                kind: job.payload.kind().as_str().to_owned(),
                root_kind: reporter.root_kind().to_owned(),
                ok: error.is_none(),
                error: error.map(|e| e.to_string()),
                error_code: error.map(|e| e.code().to_owned()),
                pipeline_done: open == 0 || error.is_some(),
            },
        );
        Ok(())
    }

    /// Blocking. Runs ready jobs until none are left (tests, and each wake-up).
    pub fn drain(&self) -> AppResult<usize> {
        let mut ran = 0;
        while self.tick()? {
            ran += 1;
        }
        Ok(ran)
    }

    /// The long-running loop. Sleeps until woken or the idle poll elapses.
    pub async fn run(self: Arc<Self>) {
        let me = self.clone();
        if let Err(e) = tauri::async_runtime::spawn_blocking(move || me.recover()).await {
            tracing::error!(error = %e, "job recovery task failed");
        }
        loop {
            let me = self.clone();
            match tauri::async_runtime::spawn_blocking(move || me.drain()).await {
                Ok(Ok(_)) => {}
                Ok(Err(e)) => tracing::error!(error = %e, "job worker error"),
                Err(e) => tracing::error!(error = %e, "job worker task panicked"),
            }
            let idle = tokio::time::sleep(Duration::from_secs(WORKER_IDLE_POLL_SECS));
            tokio::select! {
                _ = self.handle.wait() => {}
                _ = idle => {}
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn backoff_doubles_and_caps() {
        assert_eq!(backoff(1).num_seconds(), RETRY_BASE_SECS);
        assert_eq!(backoff(2).num_seconds(), RETRY_BASE_SECS * 2);
        assert_eq!(backoff(30).num_seconds(), RETRY_MAX_SECS);
        assert_eq!(backoff(0).num_seconds(), RETRY_BASE_SECS);
    }
}
