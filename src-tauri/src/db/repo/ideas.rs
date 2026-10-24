use std::collections::HashMap;

use rusqlite::{params, Connection};

use crate::db::now_ts;
use crate::error::AppResult;
use crate::extract::parse::ValidIdea;

/// Replaces a window's ideas with `ideas`, including message links, aliases, and the
/// within-window relations. Returns the new idea ids in order.
pub fn replace_for_window(
    conn: &Connection,
    window_id: i64,
    conversation_id: i64,
    ideas: &[ValidIdea],
) -> AppResult<Vec<i64>> {
    conn.execute("delete from ideas where window_id = ?1", [window_id])?;
    let now = now_ts();
    let mut ids_by_index: HashMap<usize, i64> = HashMap::new();
    for idea in ideas {
        conn.execute(
            "insert into ideas
               (conversation_id, window_id, idea_index, title, summary, kind, topic_label, excerpt,
                excerpt_verified, is_user_originated, gem_candidate, first_message_at, created_at)
             values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
            params![
                conversation_id,
                window_id,
                idea.idea_index as i64,
                idea.title,
                idea.summary,
                idea.kind,
                idea.topic_label,
                idea.excerpt,
                idea.excerpt_verified,
                idea.is_user_originated,
                idea.gem_candidate,
                idea.first_message_at,
                now,
            ],
        )?;
        let id = conn.last_insert_rowid();
        ids_by_index.insert(idea.idea_index, id);
        insert_links(conn, id, idea)?;
    }
    for idea in ideas {
        let from = ids_by_index[&idea.idea_index];
        for to in idea.related.iter().filter_map(|r| ids_by_index.get(r)) {
            conn.execute(
                "insert or ignore into idea_relations (idea_id, related_idea_id) values (?1, ?2)",
                params![from, to],
            )?;
        }
    }
    Ok(ideas.iter().map(|i| ids_by_index[&i.idea_index]).collect())
}

fn insert_links(conn: &Connection, idea_id: i64, idea: &ValidIdea) -> AppResult<()> {
    for message_id in &idea.message_ids {
        conn.execute(
            "insert or ignore into idea_messages (idea_id, message_id) values (?1, ?2)",
            params![idea_id, message_id],
        )?;
    }
    for alias in &idea.aliases {
        conn.execute(
            "insert or ignore into idea_aliases (idea_id, alias) values (?1, ?2)",
            params![idea_id, alias],
        )?;
    }
    Ok(())
}

pub fn count(conn: &Connection) -> AppResult<i64> {
    Ok(conn.query_row("select count(*) from ideas", [], |r| r.get(0))?)
}
