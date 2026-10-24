//! The user's own notes and folders, and importing documents into them.

use tauri::State;

use super::{blocking, parse_id};
use crate::app_state::AppState;
use crate::error::{AppError, AppResult};
use crate::vault::dto::{ImportedDocumentsDto, VaultFolderDto, VaultNoteDto, VaultNoteSummaryDto, VaultTreeDto};
use crate::vault::{import, ops};

/// A folder id from the frontend; null is the top level.
fn folder_arg(raw: Option<String>) -> AppResult<Option<i64>> {
    raw.as_deref().map(|r| parse_id("folder", r)).transpose()
}

#[tauri::command]
pub async fn get_vault(state: State<'_, AppState>) -> Result<VaultTreeDto, AppError> {
    let db = state.db.clone();
    blocking(move || db.call_blocking(|c| ops::tree(c))).await
}

#[tauri::command]
pub async fn create_folder(
    state: State<'_, AppState>,
    parent_id: Option<String>,
    name: Option<String>,
) -> Result<VaultFolderDto, AppError> {
    let parent = folder_arg(parent_id)?;
    let db = state.db.clone();
    blocking(move || db.call_blocking(|c| ops::create_folder(c, parent, name.as_deref()))).await
}

#[tauri::command]
pub async fn rename_folder(
    state: State<'_, AppState>,
    id: String,
    name: String,
) -> Result<VaultFolderDto, AppError> {
    let id = parse_id("folder", &id)?;
    let db = state.db.clone();
    blocking(move || db.call_blocking(|c| ops::rename_folder(c, id, &name))).await
}

#[tauri::command]
pub async fn move_folder(
    state: State<'_, AppState>,
    id: String,
    parent_id: Option<String>,
) -> Result<VaultFolderDto, AppError> {
    let id = parse_id("folder", &id)?;
    let parent = folder_arg(parent_id)?;
    let db = state.db.clone();
    blocking(move || db.call_blocking(|c| ops::move_folder(c, id, parent))).await
}

#[tauri::command]
pub async fn delete_folder(state: State<'_, AppState>, id: String) -> Result<Vec<String>, AppError> {
    let id = parse_id("folder", &id)?;
    let db = state.db.clone();
    blocking(move || db.call_blocking(|c| ops::delete_folder(c, id))).await
}

#[tauri::command]
pub async fn create_note(
    state: State<'_, AppState>,
    folder_id: Option<String>,
    title: Option<String>,
    body: String,
) -> Result<VaultNoteDto, AppError> {
    let folder = folder_arg(folder_id)?;
    let db = state.db.clone();
    blocking(move || db.call_blocking(|c| ops::create_note(c, folder, title.as_deref(), &body))).await
}

#[tauri::command]
pub async fn get_note(state: State<'_, AppState>, id: String) -> Result<VaultNoteDto, AppError> {
    let id = parse_id("note", &id)?;
    let db = state.db.clone();
    blocking(move || db.call_blocking(|c| ops::get_note(c, id))).await
}

#[tauri::command]
pub async fn save_note(
    state: State<'_, AppState>,
    id: String,
    body: String,
) -> Result<VaultNoteDto, AppError> {
    let id = parse_id("note", &id)?;
    let db = state.db.clone();
    blocking(move || db.call_blocking(|c| ops::save_note(c, id, &body))).await
}

#[tauri::command]
pub async fn rename_note(
    state: State<'_, AppState>,
    id: String,
    title: String,
) -> Result<VaultNoteSummaryDto, AppError> {
    let id = parse_id("note", &id)?;
    let db = state.db.clone();
    blocking(move || db.call_blocking(|c| ops::rename_note(c, id, &title))).await
}

#[tauri::command]
pub async fn move_note(
    state: State<'_, AppState>,
    id: String,
    folder_id: Option<String>,
) -> Result<VaultNoteSummaryDto, AppError> {
    let id = parse_id("note", &id)?;
    let folder = folder_arg(folder_id)?;
    let db = state.db.clone();
    blocking(move || db.call_blocking(|c| ops::move_note(c, id, folder))).await
}

#[tauri::command]
pub async fn delete_note(state: State<'_, AppState>, id: String) -> Result<(), AppError> {
    let id = parse_id("note", &id)?;
    let db = state.db.clone();
    blocking(move || db.call_blocking(|c| ops::delete_note(c, id))).await
}

/// Files are read before the database is locked, so a big import doesn't stall the app;
/// only writing the notes holds it.
#[tauri::command]
pub async fn import_documents(
    state: State<'_, AppState>,
    paths: Vec<String>,
    folder_id: Option<String>,
) -> Result<ImportedDocumentsDto, AppError> {
    let folder = folder_arg(folder_id)?;
    let db = state.db.clone();
    blocking(move || {
        db.call_blocking(|c| ops::ensure_folder(c, folder))?;
        let plan = import::read(&paths);
        db.call_blocking(|c| import::write(c, plan, folder))
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn folder_ids_are_optional_and_bad_ones_not_found() {
        assert_eq!(folder_arg(None).unwrap(), None);
        assert_eq!(folder_arg(Some("12".into())).unwrap(), Some(12));
        assert_eq!(folder_arg(Some("f-1".into())).unwrap_err().code(), "not_found");
    }
}
