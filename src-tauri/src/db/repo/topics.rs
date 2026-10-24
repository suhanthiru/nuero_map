use rusqlite::{params, Connection, OptionalExtension};

use crate::db::now_ts;
use crate::embed::{from_blob, normalize, to_blob};
use crate::error::AppResult;

/// Lowercase, collapse whitespace, trim punctuation at the ends.
pub fn norm_label(label: &str) -> String {
    label
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .trim_matches(|c: char| !c.is_alphanumeric())
        .to_lowercase()
}

#[derive(Debug, Clone, PartialEq)]
pub struct UnassignedIdea {
    pub id: i64,
    pub title: String,
    pub summary: String,
    pub topic_label: String,
    pub aliases: Vec<String>,
    pub first_message_at: String,
}

impl UnassignedIdea {
    /// What gets embedded: the label carries most of the topical signal.
    pub fn embedding_text(&self) -> String {
        format!("{}: {}. {}", self.topic_label, self.title, self.summary)
    }
}

pub fn unassigned_ideas(conn: &Connection) -> AppResult<Vec<UnassignedIdea>> {
    let mut stmt = conn.prepare(
        "select id, title, summary, topic_label, first_message_at from ideas
          where topic_id is null order by first_message_at, id",
    )?;
    let rows = stmt.query_map([], |r| {
        Ok(UnassignedIdea {
            id: r.get(0)?,
            title: r.get(1)?,
            summary: r.get(2)?,
            topic_label: r.get(3)?,
            aliases: Vec::new(),
            first_message_at: r.get(4)?,
        })
    })?;
    let mut ideas: Vec<UnassignedIdea> = rows.collect::<Result<_, _>>()?;
    let mut alias_stmt =
        conn.prepare_cached("select alias from idea_aliases where idea_id = ?1")?;
    for idea in &mut ideas {
        idea.aliases = alias_stmt
            .query_map([idea.id], |r| r.get(0))?
            .collect::<Result<_, _>>()?;
    }
    Ok(ideas)
}

/// Topic whose label (or alias) matches exactly; the biggest such topic wins.
pub fn find_by_label(conn: &Connection, labels: &[String]) -> AppResult<Option<i64>> {
    let mut stmt = conn.prepare_cached(
        "select t.id from topic_labels l join topics t on t.id = l.topic_id
          where l.norm = ?1 and t.merged_into is null order by t.idea_count desc limit 1",
    )?;
    for label in labels {
        let norm = norm_label(label);
        if norm.is_empty() {
            continue;
        }
        if let Some(id) = stmt.query_row([&norm], |r| r.get(0)).optional()? {
            return Ok(Some(id));
        }
    }
    Ok(None)
}

/// Nearest topics by centroid: (topic_id, cosine similarity), best first.
pub fn nearest_topics(
    conn: &Connection,
    embedding: &[f32],
    k: usize,
) -> AppResult<Vec<(i64, f32)>> {
    let mut stmt = conn.prepare_cached(
        "select topic_id, distance from vec_topics where embedding match ?1 and k = ?2 order by distance",
    )?;
    let rows = stmt.query_map(params![to_blob(embedding), k as i64], |r| {
        Ok((r.get::<_, i64>(0)?, 1.0 - r.get::<_, f64>(1)? as f32))
    })?;
    Ok(rows.collect::<Result<_, _>>()?)
}

pub fn primary_label(conn: &Connection, topic_id: i64) -> AppResult<String> {
    Ok(
        conn.query_row("select name from topics where id = ?1", [topic_id], |r| {
            r.get(0)
        })?,
    )
}

pub fn create(conn: &Connection, name: &str) -> AppResult<i64> {
    let now = now_ts();
    conn.execute(
        "insert into topics (name, created_at, updated_at) values (?1, ?2, ?2)",
        params![name.trim(), now],
    )?;
    let id = conn.last_insert_rowid();
    add_label(conn, id, name, true)?;
    Ok(id)
}

pub fn add_label(conn: &Connection, topic_id: i64, label: &str, primary: bool) -> AppResult<()> {
    let norm = norm_label(label);
    if norm.is_empty() {
        return Ok(());
    }
    conn.execute(
        "insert or ignore into topic_labels (topic_id, label, norm, is_primary) values (?1, ?2, ?3, ?4)",
        params![topic_id, label.trim(), norm, primary],
    )?;
    Ok(())
}

/// Adds an idea to a topic: centroid, counts, mention dates, vector index, and the idea row.
pub fn attach_idea(
    conn: &Connection,
    topic_id: i64,
    idea: &UnassignedIdea,
    embedding: &[f32],
    method: &str,
    sim: f32,
) -> AppResult<()> {
    let (sum_blob, count): (Option<Vec<u8>>, i64) = conn.query_row(
        "select centroid_sum, idea_count from topics where id = ?1",
        [topic_id],
        |r| Ok((r.get(0)?, r.get(1)?)),
    )?;
    let sum: Vec<f32> = match sum_blob.map(|b| from_blob(&b)) {
        Some(prev) if prev.len() == embedding.len() => {
            prev.iter().zip(embedding).map(|(a, b)| a + b).collect()
        }
        _ => embedding.to_vec(),
    };
    conn.execute(
        "update topics set centroid_sum = ?2, idea_count = ?3, updated_at = ?4,
                first_mention_at = min(coalesce(first_mention_at, ?5), ?5),
                last_mention_at = max(coalesce(last_mention_at, ?5), ?5)
          where id = ?1",
        params![
            topic_id,
            to_blob(&sum),
            count + 1,
            now_ts(),
            idea.first_message_at
        ],
    )?;
    conn.execute("delete from vec_topics where topic_id = ?1", [topic_id])?;
    conn.execute(
        "insert into vec_topics (topic_id, embedding) values (?1, ?2)",
        params![topic_id, to_blob(&normalize(&sum))],
    )?;
    conn.execute(
        "update ideas set topic_id = ?2, assignment_method = ?3, assignment_sim = ?4 where id = ?1",
        params![idea.id, topic_id, method, sim],
    )?;
    conn.execute(
        "insert into mentions (topic_id, kind, at, weight, idea_id) values (?1, 'idea', ?2, 1.0, ?3)",
        params![topic_id, idea.first_message_at, idea.id],
    )?;
    add_label(conn, topic_id, &idea.topic_label, false)?;
    for alias in &idea.aliases {
        add_label(conn, topic_id, alias, false)?;
    }
    Ok(())
}

pub fn store_idea_vector(conn: &Connection, idea_id: i64, embedding: &[f32]) -> AppResult<()> {
    conn.execute("delete from vec_ideas where idea_id = ?1", [idea_id])?;
    conn.execute(
        "insert into vec_ideas (idea_id, embedding) values (?1, ?2)",
        params![idea_id, to_blob(embedding)],
    )?;
    Ok(())
}

pub fn set_state(
    conn: &Connection,
    topic_id: i64,
    state: &str,
    check_in_at: Option<&str>,
) -> AppResult<bool> {
    let changed = conn.execute(
        "update topics set state = ?2, check_in_at = ?3, updated_at = ?4 where id = ?1",
        params![topic_id, state, check_in_at, now_ts()],
    )?;
    Ok(changed > 0)
}

pub fn rename(conn: &Connection, topic_id: i64, name: &str) -> AppResult<bool> {
    let changed = conn.execute(
        "update topics set name = ?2, updated_at = ?3 where id = ?1",
        params![topic_id, name.trim(), now_ts()],
    )?;
    if changed > 0 {
        add_label(conn, topic_id, name, false)?;
    }
    Ok(changed > 0)
}

pub fn record_opened(conn: &Connection, topic_id: i64, weight: f64) -> AppResult<()> {
    conn.execute(
        "insert into mentions (topic_id, kind, at, weight) values (?1, 'opened', ?2, ?3)",
        params![topic_id, now_ts(), weight],
    )?;
    Ok(())
}

/// Marks the idea as a restatement of the earliest near-identical idea already in the topic.
pub fn mark_duplicate(
    conn: &Connection,
    idea_id: i64,
    topic_id: i64,
    embedding: &[f32],
    min_sim: f32,
    k: usize,
) -> AppResult<Option<i64>> {
    let mut stmt = conn.prepare_cached(
        "select v.idea_id, v.distance, i.first_message_at from vec_ideas v join ideas i on i.id = v.idea_id
          where v.embedding match ?1 and k = ?2",
    )?;
    let candidates: Vec<(i64, f64, String)> = stmt
        .query_map(params![to_blob(embedding), k as i64], |r| {
            Ok((r.get(0)?, r.get(1)?, r.get(2)?))
        })?
        .collect::<Result<_, _>>()?;
    let mut topic_stmt = conn.prepare_cached("select topic_id from ideas where id = ?1")?;
    let mut best: Option<(i64, String)> = None;
    for (other, distance, at) in candidates {
        if other == idea_id || (1.0 - distance) < f64::from(min_sim) {
            continue;
        }
        let other_topic: Option<i64> = topic_stmt.query_row([other], |r| r.get(0))?;
        if other_topic == Some(topic_id) && best.as_ref().is_none_or(|(_, b)| at < *b) {
            best = Some((other, at));
        }
    }
    if let Some((original, _)) = &best {
        conn.execute(
            "update ideas set duplicate_of_idea_id = ?2 where id = ?1",
            params![idea_id, original],
        )?;
    }
    Ok(best.map(|(id, _)| id))
}
