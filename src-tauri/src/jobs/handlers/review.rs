//! Weekly review jobs: write the questions, then (after submit) grade and write the guide.

use rusqlite::Connection;

use super::{JobContext, JobOutcome};
use crate::db::repo::llm_usage;
use crate::db::repo::reviews::{self as repo, FrqResult};
use crate::error::AppResult;
use crate::jobs::queue::JobRecord;
use crate::jobs::reporter::JobReporter;
use crate::jobs::Stage;
use crate::llm::types::MessageRequest;
use crate::review::{failure_message, generate, grade, material};

/// Calls Claude and returns the finished reply text, recording token usage.
fn ask(ctx: &JobContext, purpose: &str, request: &MessageRequest) -> AppResult<String> {
    let response = ctx.llm.create_message(request)?;
    ctx.db
        .call_blocking(|c| llm_usage::record(c, purpose, None, &response))?;
    response.finished_text()
}

/// The worker retries transient errors while attempts remain; otherwise the review
/// records why it stopped (via `give_up`) so the UI can say so.
fn settle<T>(
    ctx: &JobContext,
    job: &JobRecord,
    result: AppResult<T>,
    give_up: impl FnOnce(&Connection, &str) -> AppResult<()>,
) -> AppResult<T> {
    let error = match result {
        Ok(value) => return Ok(value),
        Err(e) => e,
    };
    if !job.will_retry(&error) {
        let message = failure_message(&error);
        if let Err(db_error) = ctx.db.call_blocking(|c| give_up(c, &message)) {
            tracing::error!(error = %db_error, "could not record review failure");
        }
    }
    Err(error)
}

pub fn generate(
    ctx: &JobContext,
    job: &JobRecord,
    review_id: i64,
    reporter: &JobReporter,
) -> AppResult<JobOutcome> {
    let review = ctx.db.call_blocking(|c| repo::get(c, review_id))?;
    if review.status != "generating" {
        return Ok(JobOutcome::Done(None));
    }
    reporter.force(
        Stage::Synthesizing,
        0,
        1,
        Some("writing your questions".into()),
    );
    let (mcq, frq) = generate::counts(review.idea_count as usize);
    let written = (|| {
        let request = generate::build_request(&review.model, &review.material, mcq, frq);
        let text = ask(ctx, "review_quiz", &request)?;
        let ideas = ctx
            .db
            .call_blocking(|c| material::load_by_ids(c, &review.idea_ids))?;
        let drafts = generate::parse(&text, &ideas, mcq, frq)?;
        ctx.db
            .call_blocking(|c| repo::set_questions(c, review_id, &drafts))?;
        Ok(drafts.len())
    })();
    let count = settle(ctx, job, written, |c, message| {
        repo::mark_failed(c, review_id, message)
    })?;
    Ok(JobOutcome::Done(Some(format!(
        r#"{{"reviewId":{review_id},"questions":{count}}}"#
    ))))
}

pub fn grade(
    ctx: &JobContext,
    job: &JobRecord,
    review_id: i64,
    reporter: &JobReporter,
) -> AppResult<JobOutcome> {
    let review = ctx.db.call_blocking(|c| repo::get(c, review_id))?;
    if review.status != "grading" {
        return Ok(JobOutcome::Done(None));
    }
    reporter.force(
        Stage::Synthesizing,
        0,
        1,
        Some("grading your answers".into()),
    );
    let graded = (|| {
        let questions = ctx.db.call_blocking(|c| repo::questions(c, review_id))?;
        let request = grade::build_request(&review.model, &review.material, &questions);
        let text = ask(ctx, "review_grade", &request)?;
        let ideas = ctx
            .db
            .call_blocking(|c| material::load_by_ids(c, &review.idea_ids))?;
        let result = grade::parse(&text, &questions, &ideas)?;
        let score = grade::score(&questions, &result.frq);
        let guide_json = serde_json::to_string(&result.guide)?;
        let frq: Vec<FrqResult> = result
            .frq
            .iter()
            .map(|g| FrqResult {
                question_id: g.question_id,
                points: g.points,
                feedback: &g.feedback,
                verdicts: &g.verdicts,
            })
            .collect();
        ctx.db
            .call_blocking(|c| repo::save_grades(c, review_id, &frq, &guide_json, score))?;
        Ok(score)
    })();
    let score = settle(ctx, job, graded, |c, message| {
        repo::grading_failed(
            c,
            review_id,
            &format!("Grading didn't finish: {message} Your answers are saved; submit again."),
        )
    })?;
    Ok(JobOutcome::Done(Some(format!(
        r#"{{"reviewId":{review_id},"score":{score:.3}}}"#
    ))))
}
