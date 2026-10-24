//! The Today shelf: one topic that was hot and is fading, one parked topic due a look,
//! and one that just gained a connection. Stable for the day; avoids recent repeats.

use chrono::{DateTime, Duration, Utc};
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;

use super::decay::{load_mentions, normalized, raw_score};
use crate::config::graph::{
    FADING_LOOKBACK_DAYS, FADING_MIN_PAST, NEW_LINK_DAYS, SHELF_REPEAT_DAYS,
};
use crate::db::{now_ts, ts};
use crate::error::AppResult;
use crate::topics::dto::{topic_summary, TopicSummaryDto};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShelfCardDto {
    pub reason: String,
    pub topic: TopicSummaryDto,
    pub detail: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub related_topic: Option<TopicSummaryDto>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShelfDto {
    pub cards: Vec<ShelfCardDto>,
    pub generated_at: String,
}

struct Pick {
    reason: &'static str,
    topic: i64,
    related: Option<i64>,
}

/// Cards always appear in this order, whether freshly picked or restored from history.
fn reason_rank(reason: &str) -> u8 {
    match reason {
        "fading" => 0,
        "parked" => 1,
        _ => 2,
    }
}

fn recently_shown(conn: &Connection, today: &str) -> AppResult<Vec<i64>> {
    let since = (chrono::NaiveDate::parse_from_str(today, "%Y-%m-%d").unwrap_or_default()
        - Duration::days(SHELF_REPEAT_DAYS))
    .to_string();
    let mut stmt =
        conn.prepare("select topic_id from shelf_history where shown_on >= ?1 and shown_on < ?2")?;
    let ids = stmt
        .query_map(params![since, today], |r| r.get(0))?
        .collect::<Result<_, _>>()?;
    Ok(ids)
}

fn pick_fading(
    conn: &Connection,
    now: DateTime<Utc>,
    half_life: f64,
    skip: &[i64],
) -> AppResult<Option<Pick>> {
    let mentions = load_mentions(conn)?;
    let mut stmt =
        conn.prepare("select id from topics where state = 'active' and merged_into is null")?;
    let ids: Vec<i64> = stmt
        .query_map([], |r| r.get(0))?
        .collect::<Result<_, _>>()?;
    let then = now - Duration::days(FADING_LOOKBACK_DAYS);
    let best = ids
        .into_iter()
        .filter(|id| !skip.contains(id))
        .filter_map(|id| {
            let m = mentions.get(&id)?;
            let past = normalized(raw_score(
                &m.iter()
                    .filter(|(at, _)| *at <= then)
                    .cloned()
                    .collect::<Vec<_>>(),
                then,
                half_life,
            ));
            let present = normalized(raw_score(m, now, half_life));
            (past >= FADING_MIN_PAST && present < past).then_some((id, past - present))
        })
        .max_by(|a, b| a.1.total_cmp(&b.1));
    Ok(best.map(|(topic, _)| Pick {
        reason: "fading",
        topic,
        related: None,
    }))
}

fn pick_parked(
    conn: &Connection,
    now: &str,
    day_index: i64,
    skip: &[i64],
) -> AppResult<Option<Pick>> {
    let mut stmt = conn.prepare(
        "select id from topics where state = 'parked' and merged_into is null
          order by (check_in_at is not null and check_in_at <= ?1) desc, coalesce(last_mention_at, created_at)",
    )?;
    let ids: Vec<i64> = stmt
        .query_map([now], |r| r.get(0))?
        .filter_map(Result::ok)
        .filter(|id| !skip.contains(id))
        .collect();
    if ids.is_empty() {
        return Ok(None);
    }
    // Due check-ins come first; otherwise rotate through parked topics day by day.
    let due: bool = conn.query_row(
        "select exists(select 1 from topics where id = ?1 and check_in_at <= ?2)",
        params![ids[0], now],
        |r| r.get(0),
    )?;
    let topic = if due {
        ids[0]
    } else {
        ids[(day_index.rem_euclid(ids.len() as i64)) as usize]
    };
    Ok(Some(Pick {
        reason: "parked",
        topic,
        related: None,
    }))
}

fn pick_new_link(conn: &Connection, now: DateTime<Utc>, skip: &[i64]) -> AppResult<Option<Pick>> {
    let cutoff = ts(now - Duration::days(NEW_LINK_DAYS));
    let mut stmt = conn.prepare(
        "select e.topic_a, e.topic_b from edges e join topics a on a.id = e.topic_a join topics b on b.id = e.topic_b
          where e.kind != 'semantic' and e.first_seen_at >= ?1 order by e.first_seen_at desc, e.strength desc limit 20",
    )?;
    let rows: Vec<(i64, i64)> = stmt
        .query_map([cutoff], |r| Ok((r.get(0)?, r.get(1)?)))?
        .collect::<Result<_, _>>()?;
    Ok(rows
        .into_iter()
        .find(|(a, _)| !skip.contains(a))
        .map(|(topic, related)| Pick {
            reason: "newConnection",
            topic,
            related: Some(related),
        }))
}

fn detail(
    pick: &Pick,
    t: &TopicSummaryDto,
    related: Option<&TopicSummaryDto>,
    now: DateTime<Utc>,
) -> String {
    let idle = DateTime::parse_from_rfc3339(&t.last_active_at)
        .map(|d| (now - d.with_timezone(&Utc)).num_days())
        .unwrap_or(0);
    match pick.reason {
        "fading" => format!("Hot a few weeks ago, quiet for {idle} days."),
        "parked" => format!("Parked; last mentioned {idle} days ago."),
        _ => format!(
            "Newly linked to {}.",
            related.map_or("another topic", |r| r.title.as_str())
        ),
    }
}

fn stored_picks(conn: &Connection, today: &str) -> AppResult<Vec<Pick>> {
    let mut stmt =
        conn.prepare("select reason, topic_id from shelf_history where shown_on = ?1")?;
    let rows: Vec<(String, i64)> = stmt
        .query_map([today], |r| Ok((r.get(0)?, r.get(1)?)))?
        .collect::<Result<_, _>>()?;
    Ok(rows
        .into_iter()
        .filter_map(|(reason, topic)| {
            let reason = match reason.as_str() {
                "fading" => "fading",
                "parked" => "parked",
                "newConnection" => "newConnection",
                _ => return None,
            };
            Some(Pick {
                reason,
                topic,
                related: None,
            })
        })
        .collect())
}

/// The topic's newest connection (for a "new connection" card restored from history).
fn related_for(conn: &Connection, topic: i64) -> AppResult<Option<i64>> {
    Ok(conn
        .query_row(
            "select case when topic_a = ?1 then topic_b else topic_a end from edges
              where (topic_a = ?1 or topic_b = ?1) and kind != 'semantic' order by first_seen_at desc limit 1",
            [topic],
            |r| r.get(0),
        )
        .optional()?)
}

/// Blocking. Today's three cards (the same all day once chosen).
pub fn today(conn: &Connection, now: DateTime<Utc>, half_life: f64) -> AppResult<ShelfDto> {
    let today = now.format("%Y-%m-%d").to_string();
    let mut picks = stored_picks(conn, &today)?;
    if picks.is_empty() {
        let skip = recently_shown(conn, &today)?;
        let mut taken = skip.clone();
        let fading = pick_fading(conn, now, half_life, &taken)?;
        taken.extend(fading.as_ref().map(|p| p.topic));
        let parked = pick_parked(conn, &now_ts(), now.timestamp() / 86_400, &taken)?;
        taken.extend(parked.as_ref().map(|p| p.topic));
        let link = pick_new_link(conn, now, &taken)?;
        picks = [fading, parked, link].into_iter().flatten().collect();
        for p in &picks {
            conn.execute("insert or ignore into shelf_history (shown_on, reason, topic_id) values (?1, ?2, ?3)", params![today, p.reason, p.topic])?;
        }
    }
    picks.sort_by_key(|p| reason_rank(p.reason));
    let mut cards = Vec::new();
    for p in picks {
        let Some(topic) = topic_summary(conn, p.topic)? else {
            continue;
        };
        let related_id = match (p.reason, p.related) {
            ("newConnection", None) => related_for(conn, p.topic)?,
            (_, r) => r,
        };
        let related = related_id
            .map(|r| topic_summary(conn, r))
            .transpose()?
            .flatten();
        cards.push(ShelfCardDto {
            reason: p.reason.to_owned(),
            detail: detail(&p, &topic, related.as_ref(), now),
            topic,
            related_topic: related,
        });
    }
    Ok(ShelfDto {
        cards,
        generated_at: ts(now),
    })
}
