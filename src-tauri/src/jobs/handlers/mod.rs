//! One handler per job kind. Handlers are blocking and run on the blocking pool.

mod capture;
mod extract;
mod import_export;
mod poll_batch;
mod review;
mod topics;

use std::sync::Arc;

use super::queue::{self, JobRecord};
use super::reporter::JobReporter;
use super::JobPayload;
use crate::db::Db;
use crate::embed::Embedder;
use crate::error::AppResult;
use crate::events::EventSink;
use crate::llm::LlmClient;
use crate::secrets::ApiKeyStore;

/// Services a handler may use.
#[derive(Clone)]
pub struct JobContext {
    pub db: Db,
    pub sink: Arc<dyn EventSink>,
    pub llm: Arc<dyn LlmClient>,
    pub keys: Arc<dyn ApiKeyStore>,
    pub embedder: Arc<dyn Embedder>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum JobOutcome {
    /// Finished; the optional JSON result is stored on the job row.
    Done(Option<String>),
    /// Not finished yet (e.g. a batch still processing): run again later.
    Reschedule { after_secs: i64, message: String },
}

pub fn run(ctx: &JobContext, job: &JobRecord, reporter: &JobReporter) -> AppResult<JobOutcome> {
    match &job.payload {
        JobPayload::Import {
            path,
            source,
            expected_conversations,
        } => import_export::run(ctx, job, path, *source, *expected_conversations, reporter),
        JobPayload::Extract => extract::run(ctx, job, reporter),
        JobPayload::PollBatch { batch_id } => poll_batch::run(ctx, job, batch_id, reporter),
        JobPayload::Assign => topics::assign(ctx, job, reporter),
        JobPayload::Link => topics::link(ctx, reporter),
        JobPayload::ReviewGenerate { review_id } => {
            review::generate(ctx, job, *review_id, reporter)
        }
        JobPayload::ReviewGrade { review_id } => review::grade(ctx, job, *review_id, reporter),
        JobPayload::Capture => capture::run(ctx, job),
    }
}

/// Queues a follow-up job in the same pipeline. An equivalent open job is fine.
pub(crate) fn enqueue_child(
    ctx: &JobContext,
    parent: &JobRecord,
    payload: JobPayload,
    delay_secs: i64,
) -> AppResult<()> {
    let run_after = chrono::Utc::now() + chrono::Duration::seconds(delay_secs);
    ctx.db
        .call_blocking(|c| queue::enqueue_at(c, &payload, Some(parent.id), run_after))?;
    Ok(())
}
