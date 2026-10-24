//! Phase-0 spike: sqlite-vec registers with bundled rusqlite and answers KNN queries.

use rusqlite::{ffi::sqlite3_auto_extension, params, Connection};
use sqlite_vec::sqlite3_vec_init;

fn to_blob(v: &[f32]) -> Vec<u8> {
    v.iter().flat_map(|x| x.to_le_bytes()).collect()
}

#[test]
fn sqlite_vec_knn_returns_nearest_rows_in_order() {
    // Register before opening any connection.
    unsafe {
        sqlite3_auto_extension(Some(std::mem::transmute::<
            *const (),
            unsafe extern "C" fn(
                *mut rusqlite::ffi::sqlite3,
                *mut *mut std::os::raw::c_char,
                *const rusqlite::ffi::sqlite3_api_routines,
            ) -> i32,
        >(sqlite3_vec_init as *const ())));
    }
    let db = Connection::open_in_memory().expect("open");

    let version: String = db
        .query_row("select vec_version()", [], |r| r.get(0))
        .expect("vec_version");
    assert!(version.starts_with('v'), "unexpected version {version}");

    db.execute_batch(
        "create virtual table v using vec0(id integer primary key, embedding float[3] distance_metric=cosine);",
    )
    .expect("create vec0");
    let rows: [(i64, [f32; 3]); 3] = [
        (1, [1.0, 0.0, 0.0]),
        (2, [0.0, 1.0, 0.0]),
        (3, [0.9, 0.1, 0.0]),
    ];
    for (id, v) in rows {
        db.execute(
            "insert into v(id, embedding) values (?1, ?2)",
            params![id, to_blob(&v)],
        )
        .expect("insert");
    }

    let mut stmt = db
        .prepare("select id, distance from v where embedding match ?1 and k = 2 order by distance")
        .expect("prepare");
    let hits: Vec<(i64, f64)> = stmt
        .query_map(params![to_blob(&[1.0, 0.0, 0.0])], |r| {
            Ok((r.get(0)?, r.get(1)?))
        })
        .expect("query")
        .collect::<Result<_, _>>()
        .expect("rows");

    assert_eq!(hits.iter().map(|h| h.0).collect::<Vec<_>>(), vec![1, 3]);
    assert!(hits[0].1 < 1e-6);
}
