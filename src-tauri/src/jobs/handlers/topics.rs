//! Assign (ideas → topics) and Link (connections + fading), the last two pipeline steps.

use chrono::Utc;

use super::{enqueue_child, JobContext, JobOutcome};
use crate::db::now_ts;
use crate::error::AppResult;
use crate::events::{self, TOPICS_CHANGED};
use crate::graph::{decay, edges};
use crate::jobs::queue::JobRecord;
use crate::jobs::reporter::JobReporter;
use crate::jobs::{JobPayload, Stage};
use crate::settings;
use crate::topics::assign::assign_pending;

pub fn assign(ctx: &JobContext, job: &JobRecord, reporter: &JobReporter) -> AppResult<JobOutcome> {
    reporter.force(
        Stage::Embedding,
        0,
        0,
        Some("loading the embedding model".into()),
    );
    let report = assign_pending(&ctx.db, ctx.embedder.as_ref(), |done, total| {
        reporter.progress(
            Stage::Assigning,
            done as u64,
            total as u64,
            Some(format!("{done} of {total} ideas placed")),
        );
    })?;
    tracing::info!(
        ideas = report.ideas,
        created = report.created,
        attached = report.attached,
        "topics assigned"
    );
    enqueue_child(ctx, job, JobPayload::Link, 0)?;
    Ok(JobOutcome::Done(Some(format!(
        r#"{{"ideas":{},"created":{},"attached":{}}}"#,
        report.ideas, report.created, report.attached
    ))))
}

pub fn link(ctx: &JobContext, reporter: &JobReporter) -> AppResult<JobOutcome> {
    reporter.force(Stage::Linking, 0, 2, Some("finding connections".into()));
    let report = ctx.db.call_blocking(|c| edges::rebuild(c, &now_ts()))?;
    reporter.force(
        Stage::Linking,
        1,
        2,
        Some("updating how alive each topic is".into()),
    );
    let half_life = ctx.db.call_blocking(|c| settings::half_life_days(c))?;
    ctx.db
        .call_blocking(|c| decay::refresh_all(c, Utc::now(), half_life))?;
    events::emit(
        ctx.sink.as_ref(),
        TOPICS_CHANGED,
        &serde_json::json!({ "topicIds": [] }),
    );
    Ok(JobOutcome::Done(Some(format!(
        r#"{{"edges":{},"explicit":{},"cooccurrence":{},"semantic":{}}}"#,
        report.edges, report.explicit, report.cooccurrence, report.semantic
    ))))
}
