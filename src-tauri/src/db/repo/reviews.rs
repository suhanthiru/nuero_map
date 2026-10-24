//! Weekly reviews and their questions. Status moves generating → ready → grading →
//! graded; a failed generation ends in `failed`, a failed grading returns to `ready`
//! with the answers kept.

use rusqlite::{params, Connection, OptionalExtension, Row};

use crate::db::now_ts;
use crate::error::{AppError, AppResult};
use crate::review::generate::QuestionDraft;

#[derive(Debug, Clone, PartialEq)]
pub struct ReviewRow {
    pub id: i64,
    pub week_of: String,
    pub status: String,
    pub model: String,
    pub idea_count: i64,
    pub material: String,
    pub idea_ids: Vec<i64>,
    pub error: Option<String>,
    pub score: Option<f64>,
    pub guide_json: Option<String>,
    pub created_at: String,
    pub submitted_at: Option<String>,
    pub graded_at: Option<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct QuestionRow {
    pub id: i64,
    pub seq: i64,
    pub kind: String,
    pub topic_id: Option<i64>,
    pub topic_name: String,
    pub difficulty: String,
    pub prompt: String,
    pub choices: Vec<String>,
    pub answer_index: Option<i64>,
    pub explanation: String,
    pub key_points: Vec<String>,
    pub source_ids: Vec<i64>,
    pub response: Option<String>,
    pub points: Option<f64>,
    pub max_points: f64,
    pub feedback: Option<String>,
    pub key_points_met: Option<Vec<String>>,
}

/// The newest review of a week, for the week picker.
#[derive(Debug, Clone, PartialEq)]
pub struct ReviewBrief {
    pub id: i64,
    pub status: String,
    pub score: Option<f64>,
    pub created_at: String,
}

fn json_list<T: serde::de::DeserializeOwned>(raw: Option<String>) -> Vec<T> {
    raw.and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

pub struct NewReview<'a> {
    pub week_of: &'a str,
    pub period_start: &'a str,
    pub period_end: &'a str,
    pub model: &'a str,
    pub idea_ids: &'a [i64],
    pub material: &'a str,
}

pub fn create(conn: &Connection, new: &NewReview) -> AppResult<i64> {
    conn.execute(
        "insert into reviews (week_of, period_start, period_end, model, idea_count, material, idea_ids_json, created_at)
         values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            new.week_of,
            new.period_start,
            new.period_end,
            new.model,
            new.idea_ids.len() as i64,
            new.material,
            serde_json::to_string(new.idea_ids)?,
            now_ts()
        ],
    )?;
    Ok(conn.last_insert_rowid())
}

fn review_from_row(r: &Row) -> rusqlite::Result<ReviewRow> {
    Ok(ReviewRow {
        id: r.get(0)?,
        week_of: r.get(1)?,
        status: r.get(2)?,
        model: r.get(3)?,
        idea_count: r.get(4)?,
        material: r.get(5)?,
        idea_ids: json_list(r.get(6)?),
        error: r.get(7)?,
        score: r.get(8)?,
        guide_json: r.get(9)?,
        created_at: r.get(10)?,
        submitted_at: r.get(11)?,
        graded_at: r.get(12)?,
    })
}

pub fn get(conn: &Connection, id: i64) -> AppResult<ReviewRow> {
    conn.query_row(
        "select id, week_of, status, model, idea_count, material, idea_ids_json, error, score,
                guide_json, created_at, submitted_at, graded_at
           from reviews where id = ?1",
        [id],
        review_from_row,
    )
    .optional()?
    .ok_or_else(|| AppError::NotFound(format!("review {id}")))
}

pub fn latest_for_week(conn: &Connection, week_of: &str) -> AppResult<Option<ReviewBrief>> {
    Ok(conn
        .query_row(
            // A test in progress first, then the newest graded one: a failed retake
            // mustn't hide the study guide from an earlier test.
            "select id, status, score, created_at from reviews where week_of = ?1
              order by status in ('generating', 'ready', 'grading') desc, status = 'graded' desc,
                       created_at desc, id desc
              limit 1",
            [week_of],
            |r| {
                Ok(ReviewBrief {
                    id: r.get(0)?,
                    status: r.get(1)?,
                    score: r.get(2)?,
                    created_at: r.get(3)?,
                })
            },
        )
        .optional()?)
}

/// Stores the questions and opens the review for answers.
pub fn set_questions(
    conn: &mut Connection,
    review_id: i64,
    drafts: &[QuestionDraft],
) -> AppResult<()> {
    let tx = conn.transaction()?;
    tx.execute(
        "delete from review_questions where review_id = ?1",
        [review_id],
    )?;
    for (seq, d) in drafts.iter().enumerate() {
        tx.execute(
            "insert into review_questions
               (review_id, seq, kind, topic_id, topic_name, difficulty, prompt, choices_json,
                answer_index, explanation, key_points_json, source_ids_json, max_points)
             values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
            params![
                review_id,
                seq as i64 + 1,
                d.kind.as_str(),
                d.topic_id,
                d.topic_name,
                d.difficulty,
                d.prompt,
                serde_json::to_string(&d.choices)?,
                d.answer_index,
                d.explanation,
                serde_json::to_string(&d.key_points)?,
                serde_json::to_string(&d.source_ids)?,
                d.max_points(),
            ],
        )?;
    }
    tx.execute(
        "update reviews set status = 'ready', error = null where id = ?1",
        [review_id],
    )?;
    tx.commit()?;
    Ok(())
}

/// Reviews waiting on a job: (id, status) for those writing or grading.
pub fn unfinished(conn: &Connection) -> AppResult<Vec<(i64, String)>> {
    let mut stmt =
        conn.prepare("select id, status from reviews where status in ('generating', 'grading')")?;
    let rows = stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?;
    Ok(rows.collect::<Result<_, _>>()?)
}

pub fn mark_failed(conn: &Connection, id: i64, message: &str) -> AppResult<()> {
    conn.execute(
        "update reviews set status = 'failed', error = ?2 where id = ?1",
        params![id, message],
    )?;
    Ok(())
}

pub fn questions(conn: &Connection, review_id: i64) -> AppResult<Vec<QuestionRow>> {
    let mut stmt = conn.prepare(
        "select id, seq, kind, topic_id, topic_name, difficulty, prompt, choices_json, answer_index,
                explanation, key_points_json, source_ids_json, response, points, max_points,
                feedback, key_points_met_json
           from review_questions where review_id = ?1 order by seq",
    )?;
    let rows = stmt.query_map([review_id], |r| {
        Ok(QuestionRow {
            id: r.get(0)?,
            seq: r.get(1)?,
            kind: r.get(2)?,
            topic_id: r.get(3)?,
            topic_name: r.get(4)?,
            difficulty: r.get(5)?,
            prompt: r.get(6)?,
            choices: json_list(r.get(7)?),
            answer_index: r.get(8)?,
            explanation: r.get(9)?,
            key_points: json_list(r.get(10)?),
            source_ids: json_list(r.get(11)?),
            response: r.get(12)?,
            points: r.get(13)?,
            max_points: r.get(14)?,
            feedback: r.get(15)?,
            key_points_met: r
                .get::<_, Option<String>>(16)?
                .and_then(|s| serde_json::from_str(&s).ok()),
        })
    })?;
    Ok(rows.collect::<Result<_, _>>()?)
}

/// Saves one answer while the review is open. False when the question isn't in it.
pub fn save_response(
    conn: &Connection,
    review_id: i64,
    question_id: i64,
    response: Option<&str>,
) -> AppResult<bool> {
    let changed = conn.execute(
        "update review_questions set response = ?3 where id = ?2 and review_id = ?1",
        params![review_id, question_id, response],
    )?;
    Ok(changed == 1)
}

/// Locks the answers: stores multiple-choice points and hands off to grading. Run it in
/// the caller's transaction, together with queueing the grading job.
pub fn begin_grading(
    conn: &Connection,
    review_id: i64,
    mcq_points: &[(i64, f64)],
) -> AppResult<()> {
    for (question_id, points) in mcq_points {
        conn.execute(
            "update review_questions set points = ?3 where id = ?2 and review_id = ?1",
            params![review_id, question_id, points],
        )?;
    }
    conn.execute(
        "update reviews set status = 'grading', submitted_at = ?2, error = null where id = ?1",
        params![review_id, now_ts()],
    )?;
    Ok(())
}

/// Grading failed for good: reopen the review (answers kept) so it can be resubmitted.
pub fn grading_failed(conn: &Connection, id: i64, message: &str) -> AppResult<()> {
    conn.execute(
        "update reviews set status = 'ready', error = ?2 where id = ?1",
        params![id, message],
    )?;
    Ok(())
}

pub struct FrqResult<'a> {
    pub question_id: i64,
    pub points: f64,
    pub feedback: &'a str,
    pub verdicts: &'a [String],
}

pub fn save_grades(
    conn: &mut Connection,
    review_id: i64,
    frq: &[FrqResult],
    guide_json: &str,
    score: f64,
) -> AppResult<()> {
    let tx = conn.transaction()?;
    for g in frq {
        tx.execute(
            "update review_questions set points = ?3, feedback = ?4, key_points_met_json = ?5
              where id = ?2 and review_id = ?1",
            params![
                review_id,
                g.question_id,
                g.points,
                g.feedback,
                serde_json::to_string(g.verdicts)?
            ],
        )?;
    }
    tx.execute(
        "update reviews set status = 'graded', guide_json = ?2, score = ?3, graded_at = ?4, error = null
          where id = ?1",
        params![review_id, guide_json, score, now_ts()],
    )?;
    tx.commit()?;
    Ok(())
}
