use std::sync::Arc;

use serde::Serialize;
use tauri::State;

use super::blocking;
use crate::capture::service::CaptureService;
use crate::error::AppError;

/// What the Settings pairing panel shows (`CaptureConfig` in contract/settings.ts).
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureConfig {
    pub port: u16,
    pub token: String,
    /// Pasted into the extension's options page as one string.
    pub pairing: String,
    pub listening: bool,
    pub error: Option<String>,
}

fn config(capture: &CaptureService, token: String) -> CaptureConfig {
    let status = capture.status();
    CaptureConfig {
        pairing: format!("nm1:{}:{token}", status.port),
        port: status.port,
        token,
        listening: status.listening,
        error: status.error,
    }
}

#[tauri::command]
pub async fn get_capture_config(
    capture: State<'_, Arc<CaptureService>>,
) -> Result<CaptureConfig, AppError> {
    let service = capture.inner().clone();
    let token = blocking(move || service.token().get_or_create()).await?;
    Ok(config(&capture, token))
}

/// A new token; the extension has to be paired again.
#[tauri::command]
pub async fn regenerate_capture_token(
    capture: State<'_, Arc<CaptureService>>,
) -> Result<CaptureConfig, AppError> {
    let service = capture.inner().clone();
    let token = blocking(move || service.token().rotate()).await?;
    Ok(config(&capture, token))
}
