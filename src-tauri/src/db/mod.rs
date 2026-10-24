//! SQLite access. One connection behind a mutex; all work runs off the async runtime.

mod migrations;
pub mod repo;

use std::path::Path;
use std::sync::{Arc, Mutex, Once};
use std::time::Duration;

use chrono::{DateTime, SecondsFormat, Utc};
use rusqlite::Connection;

use crate::config::DB_BUSY_TIMEOUT_MS;
use crate::error::{AppError, AppResult};

static REGISTER_VEC: Once = Once::new();

/// Fixed-width UTC timestamp ("2026-09-28T12:00:00.000000Z") so stored values sort
/// lexicographically in time order.
pub fn ts(at: DateTime<Utc>) -> String {
    at.to_rfc3339_opts(SecondsFormat::Micros, true)
}

pub fn now_ts() -> String {
    ts(Utc::now())
}

type ExtensionInit = unsafe extern "C" fn(
    *mut rusqlite::ffi::sqlite3,
    *mut *mut std::os::raw::c_char,
    *const rusqlite::ffi::sqlite3_api_routines,
) -> i32;

/// sqlite-vec must be registered as an auto extension before the first connection opens.
fn register_sqlite_vec() {
    REGISTER_VEC.call_once(|| unsafe {
        let init = std::mem::transmute::<*const (), ExtensionInit>(
            sqlite_vec::sqlite3_vec_init as *const (),
        );
        rusqlite::ffi::sqlite3_auto_extension(Some(init));
    });
}

#[derive(Clone)]
pub struct Db {
    conn: Arc<Mutex<Connection>>,
}

impl Db {
    pub fn open(path: &Path) -> AppResult<Self> {
        register_sqlite_vec();
        let conn = Connection::open(path)?;
        conn.pragma_update(None, "journal_mode", "WAL")?;
        conn.pragma_update(None, "synchronous", "NORMAL")?;
        Self::init(conn)
    }

    pub fn open_in_memory() -> AppResult<Self> {
        register_sqlite_vec();
        Self::init(Connection::open_in_memory()?)
    }

    fn init(mut conn: Connection) -> AppResult<Self> {
        conn.pragma_update(None, "foreign_keys", "ON")?;
        conn.busy_timeout(Duration::from_millis(DB_BUSY_TIMEOUT_MS))?;
        migrations::apply(&mut conn)?;
        Ok(Self {
            conn: Arc::new(Mutex::new(conn)),
        })
    }

    /// Run `f` with the connection on the current thread. Use from blocking contexts only.
    pub fn call_blocking<T>(
        &self,
        f: impl FnOnce(&mut Connection) -> AppResult<T>,
    ) -> AppResult<T> {
        let mut guard = self
            .conn
            .lock()
            .map_err(|_| AppError::internal("database lock poisoned"))?;
        f(&mut guard)
    }

    /// Run `f` on the blocking pool so async tasks never hold the lock across an await.
    pub async fn call<T, F>(&self, f: F) -> AppResult<T>
    where
        T: Send + 'static,
        F: FnOnce(&mut Connection) -> AppResult<T> + Send + 'static,
    {
        let db = self.clone();
        tokio::task::spawn_blocking(move || db.call_blocking(f))
            .await
            .map_err(|e| AppError::internal(format!("database task failed: {e}")))?
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn opens_in_memory_with_schema_and_sqlite_vec() {
        let db = Db::open_in_memory().unwrap();

        let (tables, vec_version): (i64, String) = db
            .call_blocking(|c| {
                let tables = c.query_row(
                    "select count(*) from sqlite_master where type='table' and name in ('conversations','messages','settings')",
                    [],
                    |r| r.get(0),
                )?;
                let version = c.query_row("select vec_version()", [], |r| r.get(0))?;
                Ok((tables, version))
            })
            .unwrap();

        assert_eq!(tables, 3);
        assert!(vec_version.starts_with('v'));
    }

    #[test]
    fn opens_a_file_database_twice_without_reapplying_migrations() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("nm.sqlite");

        Db::open(&path).unwrap();
        let db = Db::open(&path).unwrap();

        let version: i64 = db
            .call_blocking(|c| Ok(c.query_row("pragma user_version", [], |r| r.get(0))?))
            .unwrap();
        assert_eq!(version, migrations::latest_version());
    }
}
