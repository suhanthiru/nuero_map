//! Folders and notes of the user's own notes. Names are compared by `link_key`; callers
//! check for clashes first, and the unique indexes catch anything that slips past.

use rusqlite::{params, Connection, OptionalExtension, Row};

use crate::db::now_ts;
use crate::error::AppResult;
use crate::topics::links::link_key;

#[derive(Debug, Clone, PartialEq)]
pub struct FolderRow {
    pub id: i64,
    pub parent_id: Option<i64>,
    pub name: String,
    pub created_at: String,
}

/// A note without its body.
#[derive(Debug, Clone, PartialEq)]
pub struct NoteRow {
    pub id: i64,
    pub folder_id: Option<i64>,
    pub title: String,
    pub created_at: String,
    pub updated_at: String,
    pub source: Option<String>,
}

const FOLDER_COLUMNS: &str = "id, parent_id, name, created_at";
const NOTE_COLUMNS: &str = "id, folder_id, title, created_at, updated_at, source";

fn folder_row(r: &Row<'_>) -> rusqlite::Result<FolderRow> {
    Ok(FolderRow {
        id: r.get(0)?,
        parent_id: r.get(1)?,
        name: r.get(2)?,
        created_at: r.get(3)?,
    })
}

fn note_row(r: &Row<'_>) -> rusqlite::Result<NoteRow> {
    Ok(NoteRow {
        id: r.get(0)?,
        folder_id: r.get(1)?,
        title: r.get(2)?,
        created_at: r.get(3)?,
        updated_at: r.get(4)?,
        source: r.get(5)?,
    })
}

pub fn folder(conn: &Connection, id: i64) -> AppResult<Option<FolderRow>> {
    Ok(conn
        .query_row(
            &format!("select {FOLDER_COLUMNS} from vault_folders where id = ?1"),
            [id],
            folder_row,
        )
        .optional()?)
}

/// Every folder, by name.
pub fn folders(conn: &Connection) -> AppResult<Vec<FolderRow>> {
    let mut stmt = conn.prepare(&format!(
        "select {FOLDER_COLUMNS} from vault_folders order by name_key, id"
    ))?;
    let rows = stmt.query_map([], folder_row)?;
    Ok(rows.collect::<Result<_, _>>()?)
}

/// The folder in `parent` whose name has this key.
pub fn folder_named(
    conn: &Connection,
    parent: Option<i64>,
    key: &str,
) -> AppResult<Option<FolderRow>> {
    Ok(conn
        .query_row(
            &format!(
                "select {FOLDER_COLUMNS} from vault_folders
                  where ifnull(parent_id, 0) = ifnull(?1, 0) and name_key = ?2"
            ),
            params![parent, key],
            folder_row,
        )
        .optional()?)
}

/// Whether a folder other than `except` in `parent` already has a name with this key.
pub fn folder_name_taken(
    conn: &Connection,
    parent: Option<i64>,
    key: &str,
    except: Option<i64>,
) -> AppResult<bool> {
    Ok(conn.query_row(
        "select exists(select 1 from vault_folders
                        where ifnull(parent_id, 0) = ifnull(?1, 0) and name_key = ?2
                          and id is not ?3)",
        params![parent, key, except],
        |r| r.get(0),
    )?)
}

pub fn insert_folder(conn: &Connection, parent: Option<i64>, name: &str) -> AppResult<FolderRow> {
    let created_at = now_ts();
    conn.execute(
        "insert into vault_folders (parent_id, name, name_key, created_at) values (?1, ?2, ?3, ?4)",
        params![parent, name, link_key(name), created_at],
    )?;
    Ok(FolderRow {
        id: conn.last_insert_rowid(),
        parent_id: parent,
        name: name.to_string(),
        created_at,
    })
}

pub fn rename_folder(conn: &Connection, id: i64, name: &str) -> AppResult<bool> {
    let changed = conn.execute(
        "update vault_folders set name = ?2, name_key = ?3 where id = ?1",
        params![id, name, link_key(name)],
    )?;
    Ok(changed > 0)
}

pub fn set_folder_parent(conn: &Connection, id: i64, parent: Option<i64>) -> AppResult<bool> {
    let changed = conn.execute(
        "update vault_folders set parent_id = ?2 where id = ?1",
        params![id, parent],
    )?;
    Ok(changed > 0)
}

/// Whether `folder` is `ancestor` or somewhere below it.
pub fn is_within(conn: &Connection, folder: i64, ancestor: i64) -> AppResult<bool> {
    Ok(conn.query_row(
        "with recursive sub(id) as (
           select ?1
           union all
           select f.id from vault_folders f join sub on f.parent_id = sub.id
         )
         select exists(select 1 from sub where id = ?2)",
        params![ancestor, folder],
        |r| r.get(0),
    )?)
}

/// Ids of the notes in `folder` and every folder below it.
pub fn note_ids_within(conn: &Connection, folder: i64) -> AppResult<Vec<i64>> {
    let mut stmt = conn.prepare(
        "with recursive sub(id) as (
           select ?1
           union all
           select f.id from vault_folders f join sub on f.parent_id = sub.id
         )
         select n.id from vault_notes n where n.folder_id in (select id from sub) order by n.id",
    )?;
    let rows = stmt.query_map([folder], |r| r.get(0))?;
    Ok(rows.collect::<Result<_, _>>()?)
}

/// Deletes the folder; its subfolders and notes go with it (foreign keys cascade).
pub fn delete_folder(conn: &Connection, id: i64) -> AppResult<bool> {
    Ok(conn.execute("delete from vault_folders where id = ?1", [id])? > 0)
}

/// Every note without its body, by title.
pub fn notes(conn: &Connection) -> AppResult<Vec<NoteRow>> {
    let mut stmt = conn.prepare(&format!(
        "select {NOTE_COLUMNS} from vault_notes order by title_key, id"
    ))?;
    let rows = stmt.query_map([], note_row)?;
    Ok(rows.collect::<Result<_, _>>()?)
}

pub fn note(conn: &Connection, id: i64) -> AppResult<Option<NoteRow>> {
    Ok(conn
        .query_row(
            &format!("select {NOTE_COLUMNS} from vault_notes where id = ?1"),
            [id],
            note_row,
        )
        .optional()?)
}

/// The note and its body.
pub fn note_with_body(conn: &Connection, id: i64) -> AppResult<Option<(NoteRow, String)>> {
    Ok(conn
        .query_row(
            &format!("select {NOTE_COLUMNS}, body from vault_notes where id = ?1"),
            [id],
            |r| Ok((note_row(r)?, r.get(6)?)),
        )
        .optional()?)
}

/// Whether a note other than `except` in `folder` already has a title with this key.
pub fn note_title_taken(
    conn: &Connection,
    folder: Option<i64>,
    key: &str,
    except: Option<i64>,
) -> AppResult<bool> {
    Ok(conn.query_row(
        "select exists(select 1 from vault_notes
                        where ifnull(folder_id, 0) = ifnull(?1, 0) and title_key = ?2
                          and id is not ?3)",
        params![folder, key, except],
        |r| r.get(0),
    )?)
}

/// Whether `folder` already holds a note with exactly this body, under this title (by key)
/// or imported from a file of this name: importing the same document again finds it.
pub fn has_copy(
    conn: &Connection,
    folder: Option<i64>,
    key: &str,
    source: &str,
    body: &str,
) -> AppResult<bool> {
    Ok(conn.query_row(
        "select exists(select 1 from vault_notes
                        where ifnull(folder_id, 0) = ifnull(?1, 0) and body = ?4
                          and (title_key = ?2 or source = ?3))",
        params![folder, key, source, body],
        |r| r.get(0),
    )?)
}

pub fn insert_note(
    conn: &Connection,
    folder: Option<i64>,
    title: &str,
    body: &str,
    source: Option<&str>,
) -> AppResult<NoteRow> {
    let now = now_ts();
    conn.execute(
        "insert into vault_notes (folder_id, title, title_key, body, source, created_at, updated_at)
         values (?1, ?2, ?3, ?4, ?5, ?6, ?6)",
        params![folder, title, link_key(title), body, source, now],
    )?;
    Ok(NoteRow {
        id: conn.last_insert_rowid(),
        folder_id: folder,
        title: title.to_string(),
        created_at: now.clone(),
        updated_at: now,
        source: source.map(str::to_string),
    })
}

/// Replaces the body; returns the new `updated_at`, or None when there is no such note.
pub fn save_body(conn: &Connection, id: i64, body: &str) -> AppResult<Option<String>> {
    let updated_at = now_ts();
    let changed = conn.execute(
        "update vault_notes set body = ?2, updated_at = ?3 where id = ?1",
        params![id, body, updated_at],
    )?;
    Ok((changed > 0).then_some(updated_at))
}

/// Renames and moves don't change `updated_at`: that tracks the text.
pub fn rename_note(conn: &Connection, id: i64, title: &str) -> AppResult<bool> {
    let changed = conn.execute(
        "update vault_notes set title = ?2, title_key = ?3 where id = ?1",
        params![id, title, link_key(title)],
    )?;
    Ok(changed > 0)
}

pub fn set_note_folder(conn: &Connection, id: i64, folder: Option<i64>) -> AppResult<bool> {
    let changed = conn.execute(
        "update vault_notes set folder_id = ?2 where id = ?1",
        params![id, folder],
    )?;
    Ok(changed > 0)
}

pub fn delete_note(conn: &Connection, id: i64) -> AppResult<bool> {
    Ok(conn.execute("delete from vault_notes where id = ?1", [id])? > 0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Db;

    #[test]
    fn deleting_a_folder_takes_its_subfolders_and_notes() {
        let db = Db::open_in_memory().unwrap();

        let (within, left) = db
            .call_blocking(|c| {
                let top = insert_folder(c, None, "Work")?;
                let sub = insert_folder(c, Some(top.id), "Old")?;
                let a = insert_note(c, Some(top.id), "Plan", "x", None)?;
                let b = insert_note(c, Some(sub.id), "Notes", "y", None)?;
                insert_note(c, None, "Loose", "z", None)?;
                let within = note_ids_within(c, top.id)?;
                assert_eq!(within, vec![a.id, b.id]);
                delete_folder(c, top.id)?;
                let left: Vec<String> = notes(c)?.into_iter().map(|n| n.title).collect();
                Ok((within.len(), (left, folders(c)?.len())))
            })
            .unwrap();

        assert_eq!(within, 2);
        assert_eq!(left, (vec!["Loose".to_string()], 0));
    }

    #[test]
    fn names_are_unique_per_parent_ignoring_case_and_spacing() {
        let db = Db::open_in_memory().unwrap();

        db.call_blocking(|c| {
            let work = insert_folder(c, None, "Work")?;
            assert!(folder_name_taken(c, None, &link_key("  WORK "), None)?);
            assert!(!folder_name_taken(c, None, "work", Some(work.id))?);
            assert!(!folder_name_taken(c, Some(work.id), "work", None)?);
            insert_folder(c, Some(work.id), "Work")?;
            assert!(insert_folder(c, None, "work").is_err(), "the index backs it up");

            insert_note(c, None, "Plan  A", "", None)?;
            assert!(note_title_taken(c, None, "plan a", None)?);
            assert!(!note_title_taken(c, Some(work.id), "plan a", None)?);
            Ok(())
        })
        .unwrap();
    }

    #[test]
    fn finds_folders_within_folders() {
        let db = Db::open_in_memory().unwrap();

        db.call_blocking(|c| {
            let a = insert_folder(c, None, "A")?;
            let b = insert_folder(c, Some(a.id), "B")?;
            let other = insert_folder(c, None, "Other")?;
            assert!(is_within(c, b.id, a.id)?);
            assert!(is_within(c, a.id, a.id)?);
            assert!(!is_within(c, a.id, b.id)?);
            assert!(!is_within(c, other.id, a.id)?);
            Ok(())
        })
        .unwrap();
    }
}
