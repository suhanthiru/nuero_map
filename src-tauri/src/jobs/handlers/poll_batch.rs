use super::{enqueue_child, JobContext, JobOutcome};
use crate::config::llm::BATCH_POLL_SECS;
use crate::error::AppResult;
use crate::extract;
use crate::jobs::queue::JobRecord;
use crate::jobs::reporter::JobReporter;
use crate::jobs::{JobPayload, Stage};

pub fn run(
    ctx: &JobContext,
    job: &JobRecord,
    batch_id: &str,
    reporter: &JobReporter,
) -> AppResult<JobOutcome> {
    let info = ctx.llm.get_batch(batch_id)?;
    let counts = &info.request_counts;
    let total =
        counts.processing + counts.succeeded + counts.errored + counts.canceled + counts.expired;
    let processed = total - counts.processing;
    if !info.is_ended() {
        let message = format!("batch {processed} of {total} processed");
        reporter.force(Stage::Extracting, processed, total, Some(message.clone()));
        return Ok(JobOutcome::Reschedule {
            after_secs: BATCH_POLL_SECS,
            message,
        });
    }
    reporter.force(
        Stage::Extracting,
        processed,
        total,
        Some("storing batch results".into()),
    );
    let report = extract::apply_batch_results(&ctx.db, ctx.llm.as_ref(), &info)?;
    if report.requeued > 0 {
        // Transient failures go back through a new extract run.
        enqueue_child(ctx, job, JobPayload::Extract, 0)?;
    }
    enqueue_child(ctx, job, JobPayload::Assign, 0)?;
    reporter.force(
        Stage::Extracting,
        total,
        total,
        Some(format!("{} ideas found", report.ideas)),
    );
    Ok(JobOutcome::Done(Some(format!(
        r#"{{"done":{},"failed":{},"requeued":{},"ideas":{}}}"#,
        report.done, report.failed, report.requeued, report.ideas
    ))))
}
