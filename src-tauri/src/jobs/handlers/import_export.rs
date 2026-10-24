use std::path::Path;

use super::{enqueue_child, JobContext, JobOutcome};
use crate::error::AppResult;
use crate::ingest::detect::RequestedSource;
use crate::ingest::import::{import_export_observed, ImportObserver};
use crate::jobs::queue::JobRecord;
use crate::jobs::reporter::JobReporter;
use crate::jobs::{JobPayload, Stage};

struct Observer<'a> {
    reporter: &'a JobReporter,
    expected: u64,
}

impl ImportObserver for Observer<'_> {
    fn stored(&self, conversations_done: usize) {
        let done = conversations_done as u64;
        let message = format!("{done} conversations stored");
        self.reporter
            .progress(Stage::Parsing, done, self.expected.max(done), Some(message));
    }

    fn should_stop(&self) -> bool {
        self.reporter.is_cancelled()
    }
}

pub fn run(
    ctx: &JobContext,
    job: &JobRecord,
    path: &str,
    source: RequestedSource,
    expected_conversations: Option<u64>,
    reporter: &JobReporter,
) -> AppResult<JobOutcome> {
    let expected = expected_conversations.unwrap_or(0);
    reporter.force(Stage::Parsing, 0, expected, None);
    let observer = Observer { reporter, expected };
    let report = import_export_observed(&ctx.db, Path::new(path), source, &observer)?;
    let done = report.conversations as u64;
    reporter.force(
        Stage::Parsing,
        done,
        done,
        Some(format!("{} messages added", report.messages_added)),
    );
    // Extraction runs as the next job in this pipeline.
    enqueue_child(ctx, job, JobPayload::Extract, 0)?;
    Ok(JobOutcome::Done(Some(serde_json::to_string(&report)?)))
}
