//! Incremental topic assignment. Ideas are processed in the order they were said; each
//! joins the topic its label names, else the nearest topic by meaning, else a new one.

use std::collections::HashMap;

use rusqlite::Connection;

use crate::config::topics::{
    ASSIGN_BATCH, ATTACH_SIM, DUPLICATE_K, DUPLICATE_SIM, GRAY_SIM, LABEL_SIM, NEAREST_K,
};
use crate::db::repo::topics::{self, UnassignedIdea};
use crate::db::Db;
use crate::embed::{cosine, Embedder};
use crate::error::AppResult;

#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub struct AssignReport {
    pub ideas: usize,
    pub created: usize,
    pub attached: usize,
}

#[derive(Debug, Clone, Copy, PartialEq)]
enum Decision {
    Attach {
        topic_id: i64,
        method: &'static str,
        sim: f32,
    },
    Create,
}

/// Label similarity cache so each topic's name is embedded once per run.
struct LabelCache<'a> {
    embedder: &'a dyn Embedder,
    vectors: HashMap<i64, Vec<f32>>,
}

impl LabelCache<'_> {
    fn get(&mut self, conn: &Connection, topic_id: i64) -> AppResult<Vec<f32>> {
        if let Some(v) = self.vectors.get(&topic_id) {
            return Ok(v.clone());
        }
        let name = topics::primary_label(conn, topic_id)?;
        let v = self.embedder.embed(&[name])?.pop().unwrap_or_default();
        self.vectors.insert(topic_id, v.clone());
        Ok(v)
    }
}

fn decide(
    conn: &Connection,
    idea: &UnassignedIdea,
    idea_vec: &[f32],
    label_vec: &[f32],
    labels: &mut LabelCache,
) -> AppResult<Decision> {
    let mut names = vec![idea.topic_label.clone()];
    names.extend(idea.aliases.iter().cloned());
    if let Some(topic_id) = topics::find_by_label(conn, &names)? {
        return Ok(Decision::Attach {
            topic_id,
            method: "label",
            sim: 1.0,
        });
    }
    let nearest = topics::nearest_topics(conn, idea_vec, NEAREST_K)?;
    let Some(&(best_id, best_sim)) = nearest.first() else {
        return Ok(Decision::Create);
    };
    if best_sim >= ATTACH_SIM {
        return Ok(Decision::Attach {
            topic_id: best_id,
            method: "meaning",
            sim: best_sim,
        });
    }
    // Gray band: content is close; join only if the names also agree.
    for &(topic_id, sim) in nearest.iter().filter(|(_, s)| *s >= GRAY_SIM) {
        let name_sim = cosine(label_vec, &labels.get(conn, topic_id)?);
        if name_sim >= LABEL_SIM {
            return Ok(Decision::Attach {
                topic_id,
                method: "meaning+label",
                sim,
            });
        }
    }
    Ok(Decision::Create)
}

fn assign_chunk(
    conn: &mut Connection,
    chunk: &[UnassignedIdea],
    vectors: &[Vec<f32>],
    label_vectors: &[Vec<f32>],
    labels: &mut LabelCache,
    report: &mut AssignReport,
) -> AppResult<()> {
    let tx = conn.transaction()?;
    for ((idea, v), lv) in chunk.iter().zip(vectors).zip(label_vectors) {
        topics::store_idea_vector(&tx, idea.id, v)?;
        let decision = decide(&tx, idea, v, lv, labels)?;
        let (topic_id, method, sim) = match decision {
            Decision::Attach {
                topic_id,
                method,
                sim,
            } => {
                report.attached += 1;
                (topic_id, method, sim)
            }
            Decision::Create => {
                report.created += 1;
                (topics::create(&tx, &idea.topic_label)?, "new", 1.0)
            }
        };
        topics::attach_idea(&tx, topic_id, idea, v, method, sim)?;
        topics::mark_duplicate(&tx, idea.id, topic_id, v, DUPLICATE_SIM, DUPLICATE_K)?;
        report.ideas += 1;
    }
    tx.commit()?;
    Ok(())
}

/// Blocking. Assigns every idea without a topic. `progress(done, total)` after each batch.
pub fn assign_pending(
    db: &Db,
    embedder: &dyn Embedder,
    mut progress: impl FnMut(usize, usize),
) -> AppResult<AssignReport> {
    let pending = db.call_blocking(|c| topics::unassigned_ideas(c))?;
    let total = pending.len();
    let mut report = AssignReport::default();
    let mut labels = LabelCache {
        embedder,
        vectors: HashMap::new(),
    };
    for chunk in pending.chunks(ASSIGN_BATCH) {
        let texts: Vec<String> = chunk.iter().map(UnassignedIdea::embedding_text).collect();
        let label_texts: Vec<String> = chunk.iter().map(|i| i.topic_label.clone()).collect();
        let vectors = embedder.embed(&texts)?;
        let label_vectors = embedder.embed(&label_texts)?;
        db.call_blocking(|c| {
            assign_chunk(c, chunk, &vectors, &label_vectors, &mut labels, &mut report)
        })?;
        progress(report.ideas, total);
    }
    Ok(report)
}
