//! Connections between topics, rebuilt from the ideas:
//! - explicit: Claude said one idea builds on another (strongest),
//! - co-occurrence: both topics came up in the same conversation,
//! - semantic: topic centroids are close (weak, hidden by default).
//!
//! Edge ids stay stable across rebuilds (upsert on the topic pair).

use std::collections::{BTreeMap, HashMap, HashSet};

use rusqlite::{params, Connection};

use crate::config::graph::{
    COOC_SATURATION, EXPLICIT_BASE, EXPLICIT_STEP, SEMANTIC_K, SEMANTIC_SIM,
};
use crate::db::repo::topics::nearest_topics;
use crate::embed::from_blob;
use crate::error::AppResult;

#[derive(Debug, Clone, PartialEq)]
struct Evidence {
    idea_a: i64,
    idea_b: i64,
    at: String,
}

#[derive(Debug, Default, Clone, PartialEq)]
struct PairBuild {
    explicit: Vec<Evidence>,
    cooc_conversations: HashSet<i64>,
    cooc: Vec<Evidence>,
    semantic_sim: Option<f32>,
}

#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub struct EdgeReport {
    pub edges: usize,
    pub explicit: usize,
    pub cooccurrence: usize,
    pub semantic: usize,
}

struct IdeaRow {
    id: i64,
    topic: i64,
    conversation: i64,
    at: String,
}

fn ordered(a: i64, b: i64) -> (i64, i64) {
    if a < b {
        (a, b)
    } else {
        (b, a)
    }
}

fn load_ideas(conn: &Connection) -> AppResult<Vec<IdeaRow>> {
    let mut stmt = conn.prepare(
        "select i.id, i.topic_id, i.conversation_id, i.first_message_at from ideas i
           join topics t on t.id = i.topic_id where t.merged_into is null order by i.first_message_at",
    )?;
    let rows = stmt.query_map([], |r| {
        Ok(IdeaRow {
            id: r.get(0)?,
            topic: r.get(1)?,
            conversation: r.get(2)?,
            at: r.get(3)?,
        })
    })?;
    Ok(rows.collect::<Result<_, _>>()?)
}

fn add_cooccurrence(ideas: &[IdeaRow], pairs: &mut BTreeMap<(i64, i64), PairBuild>) {
    let mut by_conv: HashMap<i64, Vec<&IdeaRow>> = HashMap::new();
    for idea in ideas {
        by_conv.entry(idea.conversation).or_default().push(idea);
    }
    for (conv, rows) in by_conv {
        // First idea of each topic in this conversation stands for the topic.
        let mut first: BTreeMap<i64, &IdeaRow> = BTreeMap::new();
        for r in rows {
            first.entry(r.topic).or_insert(r);
        }
        let reps: Vec<&IdeaRow> = first.into_values().collect();
        for (i, a) in reps.iter().enumerate() {
            for b in &reps[i + 1..] {
                let key = ordered(a.topic, b.topic);
                let (ia, ib) = if a.topic == key.0 { (a, b) } else { (b, a) };
                let entry = pairs.entry(key).or_default();
                entry.cooc_conversations.insert(conv);
                entry.cooc.push(Evidence {
                    idea_a: ia.id,
                    idea_b: ib.id,
                    at: ia.at.clone().max(ib.at.clone()),
                });
            }
        }
    }
}

fn add_explicit(
    conn: &Connection,
    ideas: &[IdeaRow],
    pairs: &mut BTreeMap<(i64, i64), PairBuild>,
) -> AppResult<()> {
    let by_id: HashMap<i64, &IdeaRow> = ideas.iter().map(|i| (i.id, i)).collect();
    let mut stmt = conn.prepare("select idea_id, related_idea_id from idea_relations")?;
    let rows = stmt.query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, i64>(1)?)))?;
    for row in rows {
        let (x, y) = row?;
        let (Some(a), Some(b)) = (by_id.get(&x), by_id.get(&y)) else {
            continue;
        };
        if a.topic == b.topic {
            continue;
        }
        let key = ordered(a.topic, b.topic);
        let (ia, ib) = if a.topic == key.0 { (a, b) } else { (b, a) };
        pairs.entry(key).or_default().explicit.push(Evidence {
            idea_a: ia.id,
            idea_b: ib.id,
            at: ia.at.clone().max(ib.at.clone()),
        });
    }
    Ok(())
}

fn add_semantic(conn: &Connection, pairs: &mut BTreeMap<(i64, i64), PairBuild>) -> AppResult<()> {
    let mut stmt = conn.prepare("select id, centroid_sum from topics where merged_into is null and centroid_sum is not null")?;
    let rows: Vec<(i64, Vec<u8>)> = stmt
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?
        .collect::<Result<_, _>>()?;
    for (id, blob) in rows {
        let v = crate::embed::normalize(&from_blob(&blob));
        for (other, sim) in nearest_topics(conn, &v, SEMANTIC_K + 1)? {
            if other == id || sim < SEMANTIC_SIM {
                continue;
            }
            let entry = pairs.entry(ordered(id, other)).or_default();
            entry.semantic_sim = Some(entry.semantic_sim.map_or(sim, |s| s.max(sim)));
        }
    }
    Ok(())
}

/// Kind, strength (0..1) and evidence for a pair; None when nothing connects it.
fn summarize(p: &PairBuild) -> Option<(&'static str, f64, Vec<Evidence>)> {
    let cooc_w = p.cooc_conversations.len() as f64;
    let cooc_s = ((1.0 + cooc_w).ln() / (1.0 + COOC_SATURATION).ln()).min(1.0) * 0.85;
    if !p.explicit.is_empty() {
        let s = (EXPLICIT_BASE + EXPLICIT_STEP * p.explicit.len() as f64)
            .max(cooc_s)
            .min(1.0);
        let evidence = p.explicit.iter().chain(&p.cooc).cloned().collect();
        return Some(("explicit", s, evidence));
    }
    if cooc_w > 0.0 {
        return Some(("cooccurrence", cooc_s, p.cooc.clone()));
    }
    let sim = f64::from(p.semantic_sim?);
    // Capped at 0.24: below one shared conversation (~0.27), since similarity alone is the weakest evidence.
    let s = 0.06
        + 0.18
            * ((sim - f64::from(SEMANTIC_SIM)) / (1.0 - f64::from(SEMANTIC_SIM))).clamp(0.0, 1.0);
    Some(("semantic", s, Vec::new()))
}

fn write_edge(
    conn: &Connection,
    key: (i64, i64),
    kind: &str,
    strength: f64,
    evidence: &[Evidence],
    now: &str,
) -> AppResult<i64> {
    let first = evidence
        .iter()
        .map(|e| e.at.clone())
        .min()
        .unwrap_or_else(|| now.to_owned());
    let last = evidence
        .iter()
        .map(|e| e.at.clone())
        .max()
        .unwrap_or_else(|| now.to_owned());
    let id: i64 = conn.query_row(
        "insert into edges (topic_a, topic_b, kind, strength, evidence_count, first_seen_at, last_seen_at)
         values (?1, ?2, ?3, ?4, ?5, ?6, ?7)
         on conflict (topic_a, topic_b) do update set kind = excluded.kind, strength = excluded.strength,
            evidence_count = excluded.evidence_count, first_seen_at = excluded.first_seen_at,
            last_seen_at = excluded.last_seen_at
         returning id",
        params![key.0, key.1, kind, strength, evidence.len() as i64, first, last],
        |r| r.get(0),
    )?;
    conn.execute("delete from edge_evidence where edge_id = ?1", [id])?;
    let mut insert = conn.prepare_cached(
        "insert into edge_evidence (edge_id, idea_a, idea_b, at) values (?1, ?2, ?3, ?4)",
    )?;
    for e in evidence {
        insert.execute(params![id, e.idea_a, e.idea_b, e.at])?;
    }
    Ok(id)
}

/// Blocking. Rebuilds every edge from current ideas and topics.
pub fn rebuild(conn: &mut Connection, now: &str) -> AppResult<EdgeReport> {
    let ideas = load_ideas(conn)?;
    let mut pairs: BTreeMap<(i64, i64), PairBuild> = BTreeMap::new();
    add_cooccurrence(&ideas, &mut pairs);
    add_explicit(conn, &ideas, &mut pairs)?;
    add_semantic(conn, &mut pairs)?;
    let tx = conn.transaction()?;
    let mut report = EdgeReport::default();
    let mut keep: Vec<i64> = Vec::new();
    for (key, build) in &pairs {
        let Some((kind, strength, evidence)) = summarize(build) else {
            continue;
        };
        keep.push(write_edge(&tx, *key, kind, strength, &evidence, now)?);
        report.edges += 1;
        match kind {
            "explicit" => report.explicit += 1,
            "cooccurrence" => report.cooccurrence += 1,
            _ => report.semantic += 1,
        }
    }
    let keep_list = keep
        .iter()
        .map(i64::to_string)
        .collect::<Vec<_>>()
        .join(",");
    let stale = if keep_list.is_empty() {
        "delete from edges".to_owned()
    } else {
        format!("delete from edges where id not in ({keep_list})")
    };
    tx.execute(&stale, [])?;
    tx.commit()?;
    Ok(report)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn explicit_beats_cooccurrence_and_more_conversations_mean_stronger_links() {
        let one = PairBuild {
            cooc_conversations: [1].into(),
            ..PairBuild::default()
        };
        let five = PairBuild {
            cooc_conversations: [1, 2, 3, 4, 5].into(),
            ..PairBuild::default()
        };
        let explicit = PairBuild {
            explicit: vec![Evidence {
                idea_a: 1,
                idea_b: 2,
                at: "t".into(),
            }],
            ..PairBuild::default()
        };
        let semantic = PairBuild {
            semantic_sim: Some(0.95),
            ..PairBuild::default()
        };

        let s = |p: &PairBuild| summarize(p).map(|(k, s, _)| (k, s)).unwrap();
        assert_eq!(s(&explicit).0, "explicit");
        assert!(s(&five).1 > s(&one).1);
        assert!(
            s(&semantic).1 < s(&one).1,
            "similarity alone is the weakest link"
        );
        assert!(summarize(&PairBuild::default()).is_none());
    }
}
