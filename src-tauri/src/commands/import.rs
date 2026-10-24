use std::path::PathBuf;

use tauri::State;

use super::blocking;
use crate::app_state::AppState;
use crate::db::Db;
use crate::error::{AppError, AppResult};
use crate::ingest::detect::RequestedSource;
use crate::ingest::import::{estimate_export, ImportEstimate};
use crate::jobs::queue::{self, Enqueued};
use crate::jobs::{JobHandle, JobPayload};

#[tauri::command]
pub async fn estimate_import(
    state: State<'_, AppState>,
    path: String,
    source: RequestedSource,
) -> Result<ImportEstimate, AppError> {
    let db = state.db.clone();
    blocking(move || estimate_export(&db, &PathBuf::from(path), source)).await
}

/// Queues an import job and wakes the worker. Only one import runs at a time.
pub fn queue_import(db: &Db, jobs: &JobHandle, payload: JobPayload) -> AppResult<i64> {
    match db.call_blocking(|c| queue::enqueue(c, &payload, None))? {
        Enqueued::Created(id) => {
            jobs.wake();
            Ok(id)
        }
        Enqueued::Existing(id) => Err(AppError::Busy(format!("import job {id} is still running"))),
    }
}

/// Returns the job id; progress arrives as `job_progress` / `job_finished` events.
#[tauri::command]
pub async fn import_export_zip(
    state: State<'_, AppState>,
    path: String,
    source: RequestedSource,
    expected_conversations: Option<u64>,
) -> Result<String, AppError> {
    let db = state.db.clone();
    let jobs = state.jobs.clone();
    let payload = JobPayload::Import {
        path,
        source,
        expected_conversations,
    };
    blocking(move || queue_import(&db, &jobs, payload).map(|id| id.to_string())).await
}
