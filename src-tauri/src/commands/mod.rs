//! Tauri command handlers. Names and camelCase argument keys must match
//! `src/api/contract/commands.ts` on the frontend.

pub mod capture;
pub mod import;
pub mod jobs;
pub mod review;
pub mod settings;
pub mod source;
pub mod topics;
pub mod vault;

use crate::error::{AppError, AppResult};

/// Frontend ids are strings; database ids are integers.
pub(crate) fn parse_id(kind: &str, raw: &str) -> AppResult<i64> {
    raw.parse()
        .map_err(|_| AppError::NotFound(format!("{kind} {raw}")))
}

/// Runs blocking work (parsing, SQLite) off the async runtime.
pub(crate) async fn blocking<T, F>(f: F) -> AppResult<T>
where
    T: Send + 'static,
    F: FnOnce() -> AppResult<T> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| AppError::internal(format!("background task failed: {e}")))?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_numeric_ids_and_reports_bad_ones_as_not_found() {
        assert_eq!(parse_id("message", "42").unwrap(), 42);
        assert_eq!(parse_id("message", "m-1").unwrap_err().code(), "not_found");
    }
}
