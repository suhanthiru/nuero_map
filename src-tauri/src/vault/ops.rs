//! Creating, renaming, moving and deleting the user's own notes and folders.

use rusqlite::Connection;

use crate::config::topics::NOTE_MAX_CHARS;
use crate::db::repo::vault::{self as repo, NoteRow};
use crate::error::{AppError, AppResult};
use crate::topics::links::link_key;

use super::dto::{VaultFolderDto, VaultNoteDto, VaultNoteSummaryDto, VaultTreeDto};
use super::names::{self, UNTITLED};

fn folder_gone(id: i64) -> AppError {
    AppError::NotFound(format!("folder {id}"))
}

fn note_gone(id: i64) -> AppError {
    AppError::NotFound(format!("note {id}"))
}

/// A folder id that must exist; None is the top level, which always does.
pub fn ensure_folder(conn: &Connection, id: Option<i64>) -> AppResult<()> {
    match id {
        Some(id) if repo::folder(conn, id)?.is_none() => Err(folder_gone(id)),
        _ => Ok(()),
    }
}

fn check_length(body: &str) -> AppResult<()> {
    if body.chars().count() > NOTE_MAX_CHARS {
        return Err(AppError::InvalidInput(format!(
            "a note can be at most {NOTE_MAX_CHARS} characters"
        )));
    }
    Ok(())
}

fn folder_clash(conn: &Connection, parent: Option<i64>, name: &str, except: Option<i64>) -> AppResult<()> {
    if repo::folder_name_taken(conn, parent, &link_key(name), except)? {
        return Err(AppError::Conflict(format!("a folder named {name} is already there")));
    }
    Ok(())
}

fn note_clash(conn: &Connection, folder: Option<i64>, title: &str, except: Option<i64>) -> AppResult<()> {
    if repo::note_title_taken(conn, folder, &link_key(title), except)? {
        return Err(AppError::Conflict(format!("a note named {title} is already there")));
    }
    Ok(())
}

/// A free note title in `folder`: `base`, else `base 1`, `base 2`…
pub fn free_note_title(conn: &Connection, folder: Option<i64>, base: &str) -> AppResult<String> {
    names::unique(base, |t| repo::note_title_taken(conn, folder, &link_key(t), None))
}

pub fn tree(conn: &Connection) -> AppResult<VaultTreeDto> {
    Ok(VaultTreeDto {
        folders: repo::folders(conn)?.into_iter().map(Into::into).collect(),
        notes: repo::notes(conn)?.into_iter().map(Into::into).collect(),
    })
}

/// Without a name, the first free "Untitled", "Untitled 1"… among its siblings.
pub fn create_folder(conn: &Connection, parent: Option<i64>, name: Option<&str>) -> AppResult<VaultFolderDto> {
    ensure_folder(conn, parent)?;
    let name = match name {
        Some(raw) => {
            let name = names::normalize(raw, "folder")?;
            folder_clash(conn, parent, &name, None)?;
            name
        }
        None => names::unique(UNTITLED, |n| repo::folder_name_taken(conn, parent, &link_key(n), None))?,
    };
    Ok(repo::insert_folder(conn, parent, &name)?.into())
}

/// Changing only the case or spacing of a name is allowed (it doesn't clash with itself).
pub fn rename_folder(conn: &Connection, id: i64, name: &str) -> AppResult<VaultFolderDto> {
    let folder = repo::folder(conn, id)?.ok_or_else(|| folder_gone(id))?;
    let name = names::normalize(name, "folder")?;
    folder_clash(conn, folder.parent_id, &name, Some(id))?;
    repo::rename_folder(conn, id, &name)?;
    Ok(repo::folder(conn, id)?.ok_or_else(|| folder_gone(id))?.into())
}

pub fn move_folder(conn: &Connection, id: i64, parent: Option<i64>) -> AppResult<VaultFolderDto> {
    let folder = repo::folder(conn, id)?.ok_or_else(|| folder_gone(id))?;
    if folder.parent_id == parent {
        return Ok(folder.into());
    }
    ensure_folder(conn, parent)?;
    if let Some(target) = parent {
        if repo::is_within(conn, target, id)? {
            return Err(AppError::InvalidInput(
                "a folder can't move into itself or a folder inside it".into(),
            ));
        }
    }
    folder_clash(conn, parent, &folder.name, Some(id))?;
    repo::set_folder_parent(conn, id, parent)?;
    Ok(repo::folder(conn, id)?.ok_or_else(|| folder_gone(id))?.into())
}

/// Deletes the folder with everything below it; returns the ids of the notes that went.
pub fn delete_folder(conn: &Connection, id: i64) -> AppResult<Vec<String>> {
    let tx = conn.unchecked_transaction()?;
    if repo::folder(&tx, id)?.is_none() {
        return Err(folder_gone(id));
    }
    let notes = repo::note_ids_within(&tx, id)?;
    repo::delete_folder(&tx, id)?;
    tx.commit()?;
    Ok(notes.into_iter().map(|n| n.to_string()).collect())
}

fn note_dto(row: NoteRow, body: String) -> VaultNoteDto {
    VaultNoteDto {
        summary: row.into(),
        body,
    }
}

/// Without a title, the first free "Untitled", "Untitled 1"… in that folder.
pub fn create_note(conn: &Connection, folder: Option<i64>, title: Option<&str>, body: &str) -> AppResult<VaultNoteDto> {
    check_length(body)?;
    ensure_folder(conn, folder)?;
    let title = match title {
        Some(raw) => {
            let title = names::normalize(raw, "note")?;
            note_clash(conn, folder, &title, None)?;
            title
        }
        None => free_note_title(conn, folder, UNTITLED)?,
    };
    let row = repo::insert_note(conn, folder, &title, body, None)?;
    Ok(note_dto(row, body.to_string()))
}

pub fn get_note(conn: &Connection, id: i64) -> AppResult<VaultNoteDto> {
    let (row, body) = repo::note_with_body(conn, id)?.ok_or_else(|| note_gone(id))?;
    Ok(note_dto(row, body))
}

/// Replaces the whole body. An empty body keeps the note (it's still there to write in).
pub fn save_note(conn: &Connection, id: i64, body: &str) -> AppResult<VaultNoteDto> {
    check_length(body)?;
    repo::save_body(conn, id, body)?.ok_or_else(|| note_gone(id))?;
    get_note(conn, id)
}

pub fn rename_note(conn: &Connection, id: i64, title: &str) -> AppResult<VaultNoteSummaryDto> {
    let note = repo::note(conn, id)?.ok_or_else(|| note_gone(id))?;
    let title = names::normalize(title, "note")?;
    note_clash(conn, note.folder_id, &title, Some(id))?;
    repo::rename_note(conn, id, &title)?;
    Ok(repo::note(conn, id)?.ok_or_else(|| note_gone(id))?.into())
}

pub fn move_note(conn: &Connection, id: i64, folder: Option<i64>) -> AppResult<VaultNoteSummaryDto> {
    let note = repo::note(conn, id)?.ok_or_else(|| note_gone(id))?;
    if note.folder_id == folder {
        return Ok(note.into());
    }
    ensure_folder(conn, folder)?;
    note_clash(conn, folder, &note.title, Some(id))?;
    repo::set_note_folder(conn, id, folder)?;
    Ok(repo::note(conn, id)?.ok_or_else(|| note_gone(id))?.into())
}

pub fn delete_note(conn: &Connection, id: i64) -> AppResult<()> {
    if !repo::delete_note(conn, id)? {
        return Err(note_gone(id));
    }
    Ok(())
}

#[cfg(test)]
#[path = "ops_tests.rs"]
mod tests;
