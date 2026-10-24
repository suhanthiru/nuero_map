//! What the frontend reads (`src/api/contract/review.ts`). Answers, rubrics and sources
//! stay hidden until the review is graded, so the test can't give itself away.

use std::collections::HashMap;

use chrono::{NaiveDate, TimeZone};
use rusqlite::{Connection, OptionalExtension};
use serde::Serialize;

use super::generate::counts;
use super::grade::StoredGuide;
use super::material::week_stats;
use super::week::{bounds, last_day, monday_of, parse_week, recent_mondays, DATE_FORMAT};
use crate::config::review::{MAX_IDEAS, MIN_IDEAS, WEEK_TOP_TOPICS};
use crate::db::repo::reviews::{self as repo, QuestionRow, ReviewRow};
use crate::db::ts;
use crate::error::AppResult;
use crate::topics::dto::{idea_excerpt, ExcerptDto};

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewBriefDto {
    pub id: String,
    pub status: String,
    pub score: Option<f64>,
    pub created_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewWeekDto {
    pub week_of: String,
    pub last_day: String,
    pub is_current: bool,
    pub idea_count: i64,
    pub topic_count: i64,
    pub top_topics: Vec<String>,
    pub can_review: bool,
    /// Roughly how many questions a test on this week would have.
    pub planned_mcq: usize,
    pub planned_frq: usize,
    pub latest: Option<ReviewBriefDto>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct TopicRefDto {
    pub id: String,
    pub title: String,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceIdeaDto {
    pub idea_id: String,
    pub title: String,
    pub topic_id: Option<String>,
    pub excerpt: ExcerptDto,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct KeyPointDto {
    pub text: String,
    /// "met" | "partial" | "missed" once graded.
    pub verdict: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestionDto {
    pub id: String,
    pub seq: i64,
    pub kind: String,
    pub topic: Option<TopicRefDto>,
    pub difficulty: String,
    pub prompt: String,
    pub choices: Vec<String>,
    pub response: Option<String>,
    pub max_points: f64,
    // Revealed after grading.
    pub answer_index: Option<i64>,
    pub explanation: Option<String>,
    pub key_points: Vec<KeyPointDto>,
    pub points: Option<f64>,
    pub feedback: Option<String>,
    pub sources: Vec<SourceIdeaDto>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GuideSectionDto {
    pub topic: Option<TopicRefDto>,
    pub title: String,
    pub priority: String,
    pub why: String,
    pub key_ideas: Vec<String>,
    pub misconception: Option<String>,
    pub practice: Vec<String>,
    pub sources: Vec<SourceIdeaDto>,
    pub question_seqs: Vec<i64>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GuideDto {
    pub overview: String,
    pub strengths: Vec<String>,
    pub sections: Vec<GuideSectionDto>,
    pub next_steps: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewDto {
    pub id: String,
    pub week_of: String,
    pub last_day: String,
    pub status: String,
    pub model: String,
    pub idea_count: i64,
    pub error: Option<String>,
    pub score: Option<f64>,
    pub created_at: String,
    pub submitted_at: Option<String>,
    pub graded_at: Option<String>,
    pub questions: Vec<QuestionDto>,
    pub guide: Option<GuideDto>,
}

/// The current week and the ones before it, newest first.
pub fn weeks<Tz: TimeZone>(
    conn: &Connection,
    tz: &Tz,
    today: NaiveDate,
    count: i64,
) -> AppResult<Vec<ReviewWeekDto>> {
    let this_week = monday_of(today);
    recent_mondays(today, count)
        .into_iter()
        .map(|monday| {
            let (start, end) = bounds(tz, monday)?;
            let stats = week_stats(conn, &ts(start), &ts(end), WEEK_TOP_TOPICS)?;
            let week_of = monday.format(DATE_FORMAT).to_string();
            let (planned_mcq, planned_frq) = counts((stats.idea_count as usize).min(MAX_IDEAS));
            let latest = repo::latest_for_week(conn, &week_of)?.map(|b| ReviewBriefDto {
                id: b.id.to_string(),
                status: b.status,
                score: b.score,
                created_at: b.created_at,
            });
            Ok(ReviewWeekDto {
                last_day: last_day(monday).format(DATE_FORMAT).to_string(),
                week_of,
                is_current: monday == this_week,
                idea_count: stats.idea_count,
                topic_count: stats.topic_count,
                top_topics: stats.top_topics,
                can_review: stats.idea_count >= MIN_IDEAS as i64,
                planned_mcq,
                planned_frq,
                latest,
            })
        })
        .collect()
}

/// Topic names as they are now (the stored name is the fallback for deleted topics).
struct Topics<'c> {
    conn: &'c Connection,
    cache: HashMap<i64, Option<String>>,
}

impl<'c> Topics<'c> {
    fn new(conn: &'c Connection) -> Self {
        Self {
            conn,
            cache: HashMap::new(),
        }
    }

    fn get(&mut self, id: Option<i64>, fallback: &str) -> AppResult<Option<TopicRefDto>> {
        let Some(id) = id else { return Ok(None) };
        if !self.cache.contains_key(&id) {
            let name: Option<String> = self
                .conn
                .query_row(
                    "select name from topics where id = ?1 and merged_into is null",
                    [id],
                    |r| r.get(0),
                )
                .optional()?;
            self.cache.insert(id, name);
        }
        Ok(self.cache[&id]
            .clone()
            .or_else(|| (!fallback.is_empty()).then(|| fallback.to_owned()))
            .map(|title| TopicRefDto {
                id: id.to_string(),
                title,
            }))
    }
}

/// Ideas that still exist, with the quote to re-read.
fn sources(conn: &Connection, ids: &[i64]) -> AppResult<Vec<SourceIdeaDto>> {
    let mut out = Vec::new();
    for &id in ids {
        let row: Option<(String, Option<i64>)> = conn
            .query_row(
                "select title, topic_id from ideas where id = ?1",
                [id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .optional()?;
        let (Some((title, topic_id)), Some(excerpt)) = (row, idea_excerpt(conn, id)?) else {
            continue;
        };
        out.push(SourceIdeaDto {
            idea_id: id.to_string(),
            title,
            topic_id: topic_id.map(|t| t.to_string()),
            excerpt,
        });
    }
    Ok(out)
}

fn question(
    conn: &Connection,
    topics: &mut Topics,
    q: QuestionRow,
    graded: bool,
) -> AppResult<QuestionDto> {
    let verdicts = q.key_points_met.clone().unwrap_or_default();
    Ok(QuestionDto {
        id: q.id.to_string(),
        seq: q.seq,
        topic: topics.get(q.topic_id, &q.topic_name)?,
        difficulty: q.difficulty,
        prompt: q.prompt,
        choices: q.choices,
        response: q.response,
        max_points: q.max_points,
        answer_index: q.answer_index.filter(|_| graded),
        explanation: graded.then_some(q.explanation),
        key_points: if graded {
            q.key_points
                .into_iter()
                .enumerate()
                .map(|(i, text)| KeyPointDto {
                    text,
                    verdict: verdicts.get(i).cloned(),
                })
                .collect()
        } else {
            Vec::new()
        },
        points: q.points.filter(|_| graded),
        feedback: q.feedback.filter(|_| graded),
        sources: if graded {
            sources(conn, &q.source_ids)?
        } else {
            Vec::new()
        },
        kind: q.kind,
    })
}

fn guide(conn: &Connection, topics: &mut Topics, raw: &str) -> AppResult<Option<GuideDto>> {
    let Ok(stored) = serde_json::from_str::<StoredGuide>(raw) else {
        tracing::warn!("unreadable study guide");
        return Ok(None);
    };
    let sections = stored
        .sections
        .into_iter()
        .map(|s| {
            Ok(GuideSectionDto {
                topic: topics.get(s.topic_id, &s.topic)?,
                title: s.topic,
                priority: s.priority,
                why: s.why,
                key_ideas: s.key_ideas,
                misconception: Some(s.misconception).filter(|m| !m.is_empty()),
                practice: s.practice,
                sources: sources(conn, &s.source_ids)?,
                question_seqs: s.question_seqs,
            })
        })
        .collect::<AppResult<_>>()?;
    Ok(Some(GuideDto {
        overview: stored.overview,
        strengths: stored.strengths,
        sections,
        next_steps: stored.next_steps,
    }))
}

pub fn review(conn: &Connection, id: i64) -> AppResult<ReviewDto> {
    let row: ReviewRow = repo::get(conn, id)?;
    let graded = row.status == "graded";
    let mut topics = Topics::new(conn);
    let questions = repo::questions(conn, id)?
        .into_iter()
        .map(|q| question(conn, &mut topics, q, graded))
        .collect::<AppResult<_>>()?;
    let guide = match row.guide_json.as_deref().filter(|_| graded) {
        Some(raw) => guide(conn, &mut topics, raw)?,
        None => None,
    };
    let monday = parse_week(&row.week_of)?;
    Ok(ReviewDto {
        id: row.id.to_string(),
        last_day: last_day(monday).format(DATE_FORMAT).to_string(),
        week_of: row.week_of,
        status: row.status,
        model: row.model,
        idea_count: row.idea_count,
        error: row.error,
        score: row.score,
        created_at: row.created_at,
        submitted_at: row.submitted_at,
        graded_at: row.graded_at,
        questions,
        guide,
    })
}
