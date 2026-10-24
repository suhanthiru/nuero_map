use tauri::State;

use super::{blocking, parse_id};
use crate::app_state::AppState;
use crate::config::RECENT_JOBS_LIMIT;
use crate::error::AppError;
use crate::jobs::queue::{self, JobView};

#[tauri::command]
pub async fn list_jobs(state: State<'_, AppState>) -> Result<Vec<JobView>, AppError> {
    let db = state.db.clone();
    blocking(move || db.call_blocking(|c| queue::recent(c, RECENT_JOBS_LIMIT))).await
}

/// Queued jobs are cancelled immediately; running ones stop at their next checkpoint.
#[tauri::command]
pub async fn cancel_job(state: State<'_, AppState>, job_id: String) -> Result<bool, AppError> {
    let id = parse_id("job", &job_id)?;
    if state.jobs.cancel_running(id) {
        return Ok(true);
    }
    let db = state.db.clone();
    blocking(move || db.call_blocking(|c| queue::mark_cancelled(c, id))).await
}

#[tauri::command]
pub async fn retry_job(state: State<'_, AppState>, job_id: String) -> Result<bool, AppError> {
    let id = parse_id("job", &job_id)?;
    let db = state.db.clone();
    let requeued = blocking(move || db.call_blocking(|c| queue::requeue(c, id))).await?;
    if requeued {
        state.jobs.wake();
    }
    Ok(requeued)
}
