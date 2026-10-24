//! The user's own note on a topic (`TopicNote` in `src/api/contract/notes.ts`).

use rusqlite::{Connection, OptionalExtension};
use serde::Serialize;

use crate::config::topics::NOTE_MAX_CHARS;
use crate::db::repo::note_links as links;
use crate::db::repo::notes as repo;
use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TopicNoteDto {
    pub topic_id: String,
    pub body: String,
    /// None until the first save (and again after the note is emptied).
    pub updated_at: Option<String>,
}

/// Merged-away topics count as gone, like everywhere else topics are read.
fn ensure_topic(conn: &Connection, topic_id: i64) -> AppResult<()> {
    conn.query_row(
        "select 1 from topics where id = ?1 and merged_into is null",
        [topic_id],
        |_| Ok(()),
    )
    .optional()?
    .ok_or_else(|| AppError::NotFound(format!("topic {topic_id}")))
}

pub fn get_note(conn: &Connection, topic_id: i64) -> AppResult<TopicNoteDto> {
    ensure_topic(conn, topic_id)?;
    let note = repo::get(conn, topic_id)?;
    Ok(TopicNoteDto {
        topic_id: topic_id.to_string(),
        body: note.as_ref().map(|n| n.body.clone()).unwrap_or_default(),
        updated_at: note.map(|n| n.updated_at),
    })
}

/// Replaces the whole body and the `[[links]]` stored from it, together. An empty body
/// deletes the note and its links.
pub fn save_note(conn: &Connection, topic_id: i64, body: &str) -> AppResult<TopicNoteDto> {
    if body.chars().count() > NOTE_MAX_CHARS {
        return Err(AppError::InvalidInput(format!(
            "a note can be at most {NOTE_MAX_CHARS} characters"
        )));
    }
    ensure_topic(conn, topic_id)?;
    let tx = conn.unchecked_transaction()?;
    let dto = if body.is_empty() {
        repo::delete(&tx, topic_id)?;
        links::delete_for_note(&tx, topic_id)?;
        TopicNoteDto {
            topic_id: topic_id.to_string(),
            body: String::new(),
            updated_at: None,
        }
    } else {
        let saved = repo::upsert(&tx, topic_id, body)?;
        links::replace_for_note(&tx, topic_id, body)?;
        TopicNoteDto {
            topic_id: topic_id.to_string(),
            body: saved.body,
            updated_at: Some(saved.updated_at),
        }
    };
    tx.commit()?;
    Ok(dto)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::repo::topics;
    use crate::db::Db;

    fn with_topic<T>(f: impl FnOnce(&Connection, i64) -> AppResult<T>) -> AppResult<T> {
        let db = Db::open_in_memory().unwrap();
        db.call_blocking(|c| {
            let id = topics::create(c, "Neural map")?;
            f(c, id)
        })
    }

    #[test]
    fn a_topic_without_a_note_reads_as_empty() {
        let note = with_topic(get_note).unwrap();

        assert_eq!(note.body, "");
        assert_eq!(note.updated_at, None);
    }

    #[test]
    fn saves_and_reads_back_in_camel_case() {
        let (saved, read) = with_topic(|c, id| {
            let saved = save_note(c, id, "## Open questions\n- [ ] [[Decay]]")?;
            Ok((saved, get_note(c, id)?))
        })
        .unwrap();

        assert_eq!(saved, read);
        let json = serde_json::to_value(&read).unwrap();
        assert_eq!(json["topicId"], read.topic_id);
        assert_eq!(json["body"], "## Open questions\n- [ ] [[Decay]]");
        assert!(json["updatedAt"].as_str().unwrap().ends_with('Z'));
    }

    #[test]
    fn an_empty_body_deletes_the_note() {
        let note = with_topic(|c, id| {
            save_note(c, id, "something")?;
            save_note(c, id, "")?;
            get_note(c, id)
        })
        .unwrap();

        assert_eq!(note.body, "");
        assert_eq!(note.updated_at, None);
    }

    #[test]
    fn limits_length_in_characters_not_bytes() {
        let at_limit = "é".repeat(NOTE_MAX_CHARS);
        let over = "a".repeat(NOTE_MAX_CHARS + 1);

        let (ok, err) =
            with_topic(|c, id| Ok((save_note(c, id, &at_limit), save_note(c, id, &over)))).unwrap();

        assert!(ok.is_ok());
        assert_eq!(err.unwrap_err().code(), "invalid_input");
    }

    #[test]
    fn saving_stores_the_notes_links_and_emptying_it_removes_them() {
        let counts = with_topic(|c, id| {
            topics::create(c, "Decay")?;
            let count = |c: &Connection| -> AppResult<i64> {
                Ok(c.query_row("select count(*) from note_links", [], |r| r.get(0))?)
            };
            save_note(c, id, "[[Decay]] and [[Decay]]\n[[Nowhere yet]]")?;
            let stored = count(c)?;
            save_note(c, id, "")?;
            Ok((stored, count(c)?))
        })
        .unwrap();

        assert_eq!(
            counts,
            (2, 0),
            "one row per target per line; unresolved targets are kept"
        );
    }

    #[test]
    fn unknown_or_merged_topics_are_not_found() {
        let (missing_get, missing_save, merged) = with_topic(|c, id| {
            let other = topics::create(c, "Old name")?;
            c.execute(
                "update topics set merged_into = ?1 where id = ?2",
                [id, other],
            )?;
            Ok((
                get_note(c, 9999),
                save_note(c, 9999, "x"),
                get_note(c, other),
            ))
        })
        .unwrap();

        assert_eq!(missing_get.unwrap_err().code(), "not_found");
        assert_eq!(missing_save.unwrap_err().code(), "not_found");
        assert_eq!(merged.unwrap_err().code(), "not_found");
    }
}
