//! Weekly review commands. Weeks are the user's local Monday-to-Sunday.

use std::collections::HashMap;

use chrono::Local;
use tauri::State;

use super::{blocking, parse_id};
use crate::app_state::AppState;
use crate::config::review::WEEKS_LISTED;
use crate::error::AppError;
use crate::review::dto::{self, ReviewDto, ReviewWeekDto};
use crate::review::{flow, week};
use crate::settings;

#[tauri::command]
pub async fn list_review_weeks(state: State<'_, AppState>) -> Result<Vec<ReviewWeekDto>, AppError> {
    let db = state.db.clone();
    blocking(move || {
        db.call_blocking(|c| dto::weeks(c, &Local, Local::now().date_naive(), WEEKS_LISTED))
    })
    .await
}

/// Snapshots the week's ideas and queues the job that writes the test.
#[tauri::command]
pub async fn start_review(
    state: State<'_, AppState>,
    week_of: String,
) -> Result<ReviewDto, AppError> {
    let monday = week::parse_week(&week_of)?;
    if state.keys.get()?.is_none() {
        return Err(AppError::NoApiKey);
    }
    let db = state.db.clone();
    let review = blocking(move || {
        db.call_blocking(|c| {
            let model = settings::synthesis_model(c)?;
            let tx = c.transaction()?;
            let id = flow::start(&tx, &Local, monday, &model)?;
            tx.commit()?;
            dto::review(c, id)
        })
    })
    .await?;
    state.jobs.wake();
    Ok(review)
}

#[tauri::command]
pub async fn get_review(state: State<'_, AppState>, id: String) -> Result<ReviewDto, AppError> {
    let id = parse_id("review", &id)?;
    let db = state.db.clone();
    blocking(move || db.call_blocking(|c| dto::review(c, id))).await
}

/// Saves one answer as it's given, so closing the app mid-test loses nothing.
#[tauri::command]
pub async fn save_review_answer(
    state: State<'_, AppState>,
    review_id: String,
    question_id: String,
    response: Option<String>,
) -> Result<(), AppError> {
    let review = parse_id("review", &review_id)?;
    let question = parse_id("question", &question_id)?;
    let db = state.db.clone();
    blocking(move || db.call_blocking(|c| flow::save_answer(c, review, question, response))).await
}

/// Applies the final answers, locks them, scores multiple choice, and queues grading.
/// `answers` maps question ids to responses as the user last saw them.
#[tauri::command]
pub async fn submit_review(
    state: State<'_, AppState>,
    id: String,
    answers: HashMap<String, Option<String>>,
) -> Result<ReviewDto, AppError> {
    let id = parse_id("review", &id)?;
    if state.keys.get()?.is_none() {
        return Err(AppError::NoApiKey);
    }
    let answers = answers
        .into_iter()
        .map(|(question, response)| Ok((parse_id("question", &question)?, response)))
        .collect::<Result<Vec<_>, AppError>>()?;
    let db = state.db.clone();
    let review = blocking(move || {
        db.call_blocking(|c| {
            let tx = c.transaction()?;
            flow::submit(&tx, id, &answers)?;
            tx.commit()?;
            dto::review(c, id)
        })
    })
    .await?;
    state.jobs.wake();
    Ok(review)
}
