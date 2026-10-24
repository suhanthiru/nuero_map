//! The debounced follow-up to Gemini captures: extract what was captured.

use super::{enqueue_child, JobContext, JobOutcome};
use crate::error::AppResult;
use crate::jobs::queue::JobRecord;
use crate::jobs::JobPayload;

pub fn run(ctx: &JobContext, job: &JobRecord) -> AppResult<JobOutcome> {
    if ctx.keys.get()?.is_none() {
        // Not a failure: the turns are stored, and saving a key queues their extraction.
        return Ok(JobOutcome::Done(Some(r#"{"skipped":"no_api_key"}"#.to_owned())));
    }
    enqueue_child(ctx, job, JobPayload::Extract, 0)?;
    Ok(JobOutcome::Done(None))
}
