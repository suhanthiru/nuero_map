//! The command side of a review: start one for a week, save answers, submit. Starting
//! and submitting queue their job in the caller's transaction, so a review can't be left
//! waiting on a job that was never queued.

use chrono::{NaiveDate, TimeZone};
use rusqlite::Connection;

use super::grade::mcq_points;
use super::material;
use super::week::{bounds, DATE_FORMAT};
use crate::config::review::{MAX_ANSWER_CHARS, MAX_IDEAS, MAX_MATERIAL_CHARS, MIN_IDEAS};
use crate::db::repo::reviews::{self as repo, NewReview, QuestionRow};
use crate::db::ts;
use crate::error::{AppError, AppResult};
use crate::jobs::queue::{self, Enqueued};
use crate::jobs::JobPayload;

const OPEN: &str = "ready";

/// Snapshots the week's material into a new review (status `generating`) and queues the
/// job that writes the questions.
pub fn start<Tz: TimeZone>(
    conn: &Connection,
    tz: &Tz,
    monday: NaiveDate,
    model: &str,
) -> AppResult<i64> {
    let (start, end) = bounds(tz, monday)?;
    let (start, end) = (ts(start), ts(end));
    let all = material::load_week(conn, &start, &end)?;
    if all.len() < MIN_IDEAS {
        return Err(AppError::InvalidInput(format!(
            "only {} ideas that week; a test needs at least {MIN_IDEAS}",
            all.len()
        )));
    }
    let picked = material::select(all, MAX_IDEAS, MAX_MATERIAL_CHARS);
    let ids: Vec<i64> = picked.iter().map(|i| i.id).collect();
    let review_id = repo::create(
        conn,
        &NewReview {
            week_of: &monday.format(DATE_FORMAT).to_string(),
            period_start: &start,
            period_end: &end,
            model,
            idea_ids: &ids,
            material: &material::render(&picked, monday),
        },
    )?;
    queue::enqueue(conn, &JobPayload::ReviewGenerate { review_id }, None)?;
    Ok(review_id)
}

fn require_open(conn: &Connection, review_id: i64) -> AppResult<()> {
    if repo::get(conn, review_id)?.status != OPEN {
        return Err(AppError::InvalidInput(
            "this test isn't taking answers right now".into(),
        ));
    }
    Ok(())
}

/// Multiple choice: a valid option index. Free response: the text as typed (capped);
/// blank means unanswered.
fn normalize(q: &QuestionRow, response: Option<String>) -> AppResult<Option<String>> {
    let Some(raw) = response.filter(|r| !r.trim().is_empty()) else {
        return Ok(None);
    };
    if q.kind != "mcq" {
        return Ok(Some(raw.chars().take(MAX_ANSWER_CHARS).collect()));
    }
    match raw.trim().parse::<usize>() {
        Ok(index) if index < q.choices.len() => Ok(Some(index.to_string())),
        _ => Err(AppError::InvalidInput(format!("no option {raw}"))),
    }
}

pub fn save_answer(
    conn: &Connection,
    review_id: i64,
    question_id: i64,
    response: Option<String>,
) -> AppResult<()> {
    require_open(conn, review_id)?;
    let question = repo::questions(conn, review_id)?
        .into_iter()
        .find(|q| q.id == question_id)
        .ok_or_else(|| AppError::NotFound(format!("question {question_id}")))?;
    let value = normalize(&question, response)?;
    repo::save_response(conn, review_id, question_id, value.as_deref())?;
    Ok(())
}

/// Applies the answers as the user last saw them, locks them, scores multiple choice,
/// and queues grading. Taking the answers with the submit means a lost or reordered
/// autosave can't change what gets graded.
pub fn submit(
    conn: &Connection,
    review_id: i64,
    answers: &[(i64, Option<String>)],
) -> AppResult<()> {
    require_open(conn, review_id)?;
    let questions = repo::questions(conn, review_id)?;
    for (question_id, response) in answers {
        let question = questions
            .iter()
            .find(|q| q.id == *question_id)
            .ok_or_else(|| AppError::NotFound(format!("question {question_id}")))?;
        let value = normalize(question, response.clone())?;
        repo::save_response(conn, review_id, question.id, value.as_deref())?;
    }
    let mcq: Vec<(i64, f64)> = repo::questions(conn, review_id)?
        .iter()
        .filter(|q| q.kind == "mcq")
        .map(|q| (q.id, mcq_points(q)))
        .collect();
    repo::begin_grading(conn, review_id, &mcq)?;
    queue::enqueue(conn, &JobPayload::ReviewGrade { review_id }, None)?;
    Ok(())
}

/// Queues the job again for any review left writing or grading without one (a crash
/// mid-step, or a cancelled job). Enqueueing reuses an open job with the same key.
pub fn requeue_unfinished(conn: &mut Connection) -> AppResult<usize> {
    let mut queued = 0;
    for (review_id, status) in repo::unfinished(conn)? {
        let payload = if status == "grading" {
            JobPayload::ReviewGrade { review_id }
        } else {
            JobPayload::ReviewGenerate { review_id }
        };
        if let Enqueued::Created(_) = queue::enqueue(conn, &payload, None)? {
            queued += 1;
        }
    }
    Ok(queued)
}
