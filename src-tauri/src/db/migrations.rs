//! Forward-only migrations tracked with `PRAGMA user_version`.

use rusqlite::Connection;

use crate::db::repo::note_links;
use crate::error::AppResult;

/// The version that added `note_links`. A database crossing it gets the links of the notes
/// it already has, which were saved before links were stored.
const NOTE_LINKS_VERSION: i64 = 7;

const MIGRATIONS: &[&str] = &[
    include_str!("sql/0001_ingest.sql"),
    include_str!("sql/0002_jobs.sql"),
    include_str!("sql/0003_extraction.sql"),
    include_str!("sql/0004_topics.sql"),
    include_str!("sql/0005_reviews.sql"),
    include_str!("sql/0006_notes.sql"),
    include_str!("sql/0007_note_links.sql"),
    include_str!("sql/0008_vault.sql"),
];

#[cfg(test)]
pub fn latest_version() -> i64 {
    MIGRATIONS.len() as i64
}

pub fn apply(conn: &mut Connection) -> AppResult<()> {
    let current: i64 = conn.query_row("pragma user_version", [], |r| r.get(0))?;
    for (index, sql) in MIGRATIONS.iter().enumerate().skip(current.max(0) as usize) {
        let tx = conn.transaction()?;
        tx.execute_batch(sql)?;
        tx.pragma_update(None, "user_version", index as i64 + 1)?;
        tx.commit()?;
        tracing::info!(version = index + 1, "applied migration");
    }
    // Runs after every migration, so it writes to the schema the code expects.
    if current < NOTE_LINKS_VERSION && MIGRATIONS.len() as i64 >= NOTE_LINKS_VERSION {
        let tx = conn.transaction()?;
        let notes = note_links::backfill(&tx)?;
        tx.commit()?;
        tracing::info!(notes, "backfilled note links");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::repo::topics;

    #[test]
    fn crossing_the_note_links_version_backfills_existing_notes() {
        super::super::register_sqlite_vec();
        let mut conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        for sql in &MIGRATIONS[..NOTE_LINKS_VERSION as usize - 1] {
            conn.execute_batch(sql).unwrap();
        }
        conn.pragma_update(None, "user_version", NOTE_LINKS_VERSION - 1)
            .unwrap();
        let a = topics::create(&conn, "Alpha").unwrap();
        topics::create(&conn, "Beta").unwrap();
        conn.execute(
            "insert into topic_notes (topic_id, body, updated_at) values (?1, 'see [[Beta]]', 'x')",
            [a],
        )
        .unwrap();

        apply(&mut conn).unwrap();
        apply(&mut conn).unwrap();

        let rows: Vec<(i64, String)> = conn
            .prepare("select source_topic, target_key from note_links")
            .unwrap()
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        assert_eq!(rows, vec![(a, "beta".to_string())]);
    }
}
