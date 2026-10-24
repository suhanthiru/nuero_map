use rusqlite::{params, Connection, OptionalExtension};

use crate::db::now_ts;
use crate::error::AppResult;

#[derive(Debug, Clone, PartialEq)]
pub struct Note {
    pub body: String,
    pub updated_at: String,
}

pub fn get(conn: &Connection, topic_id: i64) -> AppResult<Option<Note>> {
    Ok(conn
        .query_row(
            "select body, updated_at from topic_notes where topic_id = ?1",
            [topic_id],
            |r| {
                Ok(Note {
                    body: r.get(0)?,
                    updated_at: r.get(1)?,
                })
            },
        )
        .optional()?)
}

/// Inserts or replaces the note; returns what was stored.
pub fn upsert(conn: &Connection, topic_id: i64, body: &str) -> AppResult<Note> {
    let updated_at = now_ts();
    conn.execute(
        "insert into topic_notes (topic_id, body, updated_at) values (?1, ?2, ?3)
         on conflict (topic_id) do update set body = excluded.body, updated_at = excluded.updated_at",
        params![topic_id, body, updated_at],
    )?;
    Ok(Note {
        body: body.to_string(),
        updated_at,
    })
}

pub fn delete(conn: &Connection, topic_id: i64) -> AppResult<()> {
    conn.execute("delete from topic_notes where topic_id = ?1", [topic_id])?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::repo::topics;
    use crate::db::Db;

    #[test]
    fn round_trips_overwrites_and_deletes() {
        let db = Db::open_in_memory().unwrap();

        db.call_blocking(|c| {
            let id = topics::create(c, "Decay scoring")?;
            assert_eq!(get(c, id)?, None);

            upsert(c, id, "first")?;
            let saved = upsert(c, id, "second")?;
            assert_eq!(get(c, id)?, Some(saved));

            delete(c, id)?;
            assert_eq!(get(c, id)?, None);
            Ok(())
        })
        .unwrap();
    }

    #[test]
    fn goes_away_with_its_topic() {
        let db = Db::open_in_memory().unwrap();

        let left: i64 = db
            .call_blocking(|c| {
                let id = topics::create(c, "Cold brew")?;
                upsert(c, id, "1:8, 16 hours")?;
                c.execute("delete from topics where id = ?1", [id])?;
                Ok(c.query_row("select count(*) from topic_notes", [], |r| r.get(0))?)
            })
            .unwrap();

        assert_eq!(left, 0);
    }
}
