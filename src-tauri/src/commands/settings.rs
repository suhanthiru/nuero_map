use std::sync::Arc;

use serde::Serialize;
use tauri::State;

use super::blocking;
use crate::app_state::AppState;
use crate::capture::service::CaptureService;
use crate::db::repo::windows;
use crate::error::{AppError, AppResult};
use crate::jobs::queue::{self, Enqueued};
use crate::jobs::JobPayload;
use crate::secrets::validate_key_shape;
use crate::settings::{self, Settings, SettingsPatch};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiKeyCheck {
    pub ok: bool,
    pub message: String,
}

fn current(state: &AppState) -> AppResult<Settings> {
    let has_key = state.keys.get()?.is_some();
    let model_ready = state.local_embedder.is_downloaded();
    state
        .db
        .call_blocking(|c| settings::load(c, has_key, model_ready))
}

/// Queues an extraction run (or reuses the open one) and wakes the worker.
pub fn queue_extraction(state: &AppState) -> AppResult<i64> {
    let id = state
        .db
        .call_blocking(|c| match queue::enqueue(c, &JobPayload::Extract, None)? {
            Enqueued::Created(id) | Enqueued::Existing(id) => Ok(id),
        })?;
    state.jobs.wake();
    Ok(id)
}

#[tauri::command]
pub async fn get_settings(state: State<'_, AppState>) -> Result<Settings, AppError> {
    current(&state)
}

/// Saves the patch; turning capture on or off, or changing its port, moves the listener.
#[tauri::command]
pub async fn set_settings(
    state: State<'_, AppState>,
    capture: State<'_, Arc<CaptureService>>,
    patch: SettingsPatch,
) -> Result<Settings, AppError> {
    state.db.call_blocking(|c| settings::apply(c, &patch))?;
    let saved = current(&state)?;
    if patch.capture_enabled.is_some() || patch.capture_port.is_some() {
        capture
            .reconfigure(saved.capture_enabled, saved.capture_port)
            .await;
    }
    Ok(saved)
}

/// Stores the key in the OS keychain, then resumes any extraction waiting on it.
#[tauri::command]
pub async fn set_api_key(state: State<'_, AppState>, key: String) -> Result<Settings, AppError> {
    let key = validate_key_shape(&key)?;
    state.keys.set(&key)?;
    if state.db.call_blocking(|c| extraction_waiting(c))? {
        queue_extraction(&state)?;
    }
    current(&state)
}

/// Windows waiting on a key, or conversations (e.g. Gemini captures) not yet planned.
pub fn extraction_waiting(conn: &rusqlite::Connection) -> AppResult<bool> {
    Ok(windows::count_with_status(conn, "pending")? > 0
        || !windows::conversations_needing_plan(conn)?.is_empty())
}

#[tauri::command]
pub async fn clear_api_key(state: State<'_, AppState>) -> Result<Settings, AppError> {
    state.keys.clear()?;
    current(&state)
}

#[tauri::command]
pub async fn test_api_key(state: State<'_, AppState>) -> Result<ApiKeyCheck, AppError> {
    let llm = state.llm.clone();
    let result = blocking(move || llm.check_key()).await;
    Ok(match result {
        Ok(()) => ApiKeyCheck {
            ok: true,
            message: "The key works.".into(),
        },
        Err(e @ (AppError::NoApiKey | AppError::InvalidApiKey | AppError::Network(_))) => {
            ApiKeyCheck {
                ok: false,
                message: e.to_string(),
            }
        }
        Err(e) => return Err(e),
    })
}

#[tauri::command]
pub async fn run_extraction(state: State<'_, AppState>) -> Result<String, AppError> {
    Ok(queue_extraction(&state)?.to_string())
}
