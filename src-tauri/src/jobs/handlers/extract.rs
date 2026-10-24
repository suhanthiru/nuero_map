use super::{enqueue_child, JobContext, JobOutcome};
use crate::config::llm::{BATCH_FIRST_POLL_SECS, DIRECT_WINDOW_LIMIT};
use crate::db::repo::windows;
use crate::error::{AppError, AppResult};
use crate::extract::{self, plan, WindowOutcome};
use crate::jobs::queue::JobRecord;
use crate::jobs::reporter::JobReporter;
use crate::jobs::{JobPayload, Stage};

/// Delay before retrying windows that hit transient errors in direct mode.
const REQUEUE_RETRY_SECS: i64 = 300;

pub fn run(ctx: &JobContext, job: &JobRecord, reporter: &JobReporter) -> AppResult<JobOutcome> {
    reporter.force(Stage::Extracting, 0, 0, Some("planning windows".into()));
    let planned = ctx.db.call_blocking(plan::plan_pending)?;
    let pending: Vec<i64> = ctx
        .db
        .call_blocking(|c| windows::with_status(c, "pending"))?
        .into_iter()
        .map(|w| w.id)
        .collect();
    tracing::info!(
        conversations = planned.conversations,
        added = planned.windows_added,
        pending = pending.len(),
        "extraction planned"
    );
    if pending.is_empty() {
        // Nothing new to extract, but earlier ideas may still need topics.
        enqueue_child(ctx, job, JobPayload::Assign, 0)?;
        return Ok(JobOutcome::Done(Some(r#"{"windows":0}"#.into())));
    }
    // Planning is local and free; stop here if there's no key, leaving windows pending.
    ctx.keys.require()?;
    if pending.len() <= DIRECT_WINDOW_LIMIT {
        let outcome = run_direct(ctx, &pending, reporter)?;
        enqueue_child(ctx, job, JobPayload::Assign, 0)?;
        Ok(outcome)
    } else {
        run_batched(ctx, job, &pending, reporter)
    }
}

fn run_direct(ctx: &JobContext, pending: &[i64], reporter: &JobReporter) -> AppResult<JobOutcome> {
    let total = pending.len() as u64;
    let (mut ideas, mut requeued) = (0, 0);
    for (i, &window_id) in pending.iter().enumerate() {
        if reporter.is_cancelled() {
            return Err(AppError::Cancelled);
        }
        match extract::extract_direct(&ctx.db, ctx.llm.as_ref(), window_id)? {
            WindowOutcome::Done { ideas: n, .. } => ideas += n,
            WindowOutcome::Requeued => requeued += 1,
            WindowOutcome::Failed => {}
        }
        reporter.progress(
            Stage::Extracting,
            i as u64 + 1,
            total,
            Some(format!("{ideas} ideas found")),
        );
    }
    if requeued > 0 {
        return Ok(JobOutcome::Reschedule {
            after_secs: REQUEUE_RETRY_SECS,
            message: format!("{requeued} windows will be retried"),
        });
    }
    Ok(JobOutcome::Done(Some(format!(
        r#"{{"windows":{total},"ideas":{ideas}}}"#
    ))))
}

fn run_batched(
    ctx: &JobContext,
    job: &JobRecord,
    pending: &[i64],
    reporter: &JobReporter,
) -> AppResult<JobOutcome> {
    let total = pending.len() as u64;
    reporter.force(
        Stage::Extracting,
        0,
        total,
        Some(format!("submitting {total} windows as a batch")),
    );
    let batch_ids = extract::submit_batches(&ctx.db, ctx.llm.as_ref(), pending)?;
    for batch_id in &batch_ids {
        enqueue_child(
            ctx,
            job,
            JobPayload::PollBatch {
                batch_id: batch_id.clone(),
            },
            BATCH_FIRST_POLL_SECS,
        )?;
    }
    reporter.force(
        Stage::Extracting,
        0,
        total,
        Some(format!("{} batch(es) processing", batch_ids.len())),
    );
    Ok(JobOutcome::Done(Some(format!(
        r#"{{"windows":{total},"batches":{}}}"#,
        batch_ids.len()
    ))))
}
