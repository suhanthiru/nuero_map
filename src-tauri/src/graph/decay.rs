//! How alive a topic is: every mention adds weight that halves every `half_life` days,
//! keyed off when something was *said*, never when it was imported.

use std::collections::HashMap;

use chrono::{DateTime, Utc};
use rusqlite::{params, Connection};

use crate::config::graph::DECAY_SCALE;
use crate::db::ts;
use crate::error::AppResult;

const SECONDS_PER_DAY: f64 = 86_400.0;

/// (when, weight) per mention, grouped by topic id.
pub type MentionsByTopic = HashMap<i64, Vec<(DateTime<Utc>, f64)>>;

/// Sum of w * 2^(-age / half_life). Future-dated mentions count as now.
pub fn raw_score(
    mentions: &[(DateTime<Utc>, f64)],
    now: DateTime<Utc>,
    half_life_days: f64,
) -> f64 {
    mentions
        .iter()
        .map(|(at, w)| {
            let age_days = ((now - *at).num_seconds() as f64 / SECONDS_PER_DAY).max(0.0);
            w * 0.5_f64.powf(age_days / half_life_days)
        })
        .sum()
}

/// 0..1, absolute (not relative to other topics), so everything can fade together:
/// one mention today ≈ 0.28, a handful this week ≈ 0.8+.
pub fn normalized(score: f64) -> f64 {
    1.0 - (-score / DECAY_SCALE).exp()
}

/// All mentions per topic, parsed.
pub fn load_mentions(conn: &Connection) -> AppResult<MentionsByTopic> {
    let mut stmt = conn.prepare("select topic_id, at, weight from mentions")?;
    let rows = stmt.query_map([], |r| {
        Ok((
            r.get::<_, i64>(0)?,
            r.get::<_, String>(1)?,
            r.get::<_, f64>(2)?,
        ))
    })?;
    let mut map: MentionsByTopic = HashMap::new();
    for row in rows {
        let (topic, at, w) = row?;
        if let Ok(at) = DateTime::parse_from_rfc3339(&at) {
            map.entry(topic)
                .or_default()
                .push((at.with_timezone(&Utc), w));
        }
    }
    Ok(map)
}

/// Recomputes and stores every topic's normalized decay. Returns topics updated.
pub fn refresh_all(
    conn: &mut Connection,
    now: DateTime<Utc>,
    half_life_days: f64,
) -> AppResult<usize> {
    let mentions = load_mentions(conn)?;
    let tx = conn.transaction()?;
    let now_s = ts(now);
    let mut n = 0;
    {
        let mut ids_stmt = tx.prepare("select id from topics")?;
        let ids: Vec<i64> = ids_stmt
            .query_map([], |r| r.get(0))?
            .collect::<Result<_, _>>()?;
        let mut update =
            tx.prepare("update topics set decay_score = ?2, decay_computed_at = ?3 where id = ?1")?;
        for id in ids {
            let score = mentions
                .get(&id)
                .map_or(0.0, |m| raw_score(m, now, half_life_days));
            update.execute(params![id, normalized(score), now_s])?;
            n += 1;
        }
    }
    tx.commit()?;
    Ok(n)
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Duration;

    #[test]
    fn halves_every_half_life_and_ignores_future_dates() {
        let now = Utc::now();
        let today = raw_score(&[(now, 1.0)], now, 14.0);
        let old = raw_score(&[(now - Duration::days(14), 1.0)], now, 14.0);
        let future = raw_score(&[(now + Duration::days(3), 1.0)], now, 14.0);

        assert!((today - 1.0).abs() < 1e-9);
        assert!((old - 0.5).abs() < 1e-6);
        assert!((future - 1.0).abs() < 1e-9);
    }

    #[test]
    fn normalized_is_bounded_and_monotonic() {
        assert_eq!(normalized(0.0), 0.0);
        assert!(normalized(1.0) < normalized(3.0));
        assert!(normalized(100.0) <= 1.0);
    }
}
