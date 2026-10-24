use rusqlite::{params, Connection, OptionalExtension};

use crate::error::AppResult;

pub fn get(conn: &Connection, key: &str) -> AppResult<Option<String>> {
    Ok(conn
        .query_row(
            "select value from settings where key = ?1",
            params![key],
            |r| r.get(0),
        )
        .optional()?)
}

pub fn set(conn: &Connection, key: &str, value: &str) -> AppResult<()> {
    conn.execute(
        "insert into settings (key, value) values (?1, ?2)
         on conflict (key) do update set value = excluded.value",
        params![key, value],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Db;

    #[test]
    fn round_trips_and_overwrites() {
        let db = Db::open_in_memory().unwrap();

        let value = db
            .call_blocking(|c| {
                assert_eq!(get(c, "half_life_days")?, None);
                set(c, "half_life_days", "14")?;
                set(c, "half_life_days", "21")?;
                get(c, "half_life_days")
            })
            .unwrap();

        assert_eq!(value.as_deref(), Some("21"));
    }
}
