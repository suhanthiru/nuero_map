//! Grading. Multiple choice is scored here; Claude grades free responses against their
//! rubric and writes the study guide from what the answers showed.

use std::collections::{HashMap, HashSet};

use serde::{Deserialize, Serialize};
use serde_json::json;

use super::material::MaterialIdea;
use super::prompt::{grade_schema, GRADE_SYSTEM, PRIORITIES, VERDICTS};
use crate::config::review::{EFFORT, MAX_TOKENS};
use crate::db::repo::reviews::QuestionRow;
use crate::error::{AppError, AppResult};
use crate::extract::request::{attr, escape};
use crate::llm::refusal_fallback;
use crate::llm::types::{Message, MessageRequest, OutputConfig, SystemBlock};

const MISSED: &str = "missed";
const FALLBACK_PRIORITY: &str = "refresh";
const SKIPPED_FEEDBACK: &str =
    "You skipped this one. Compare the model answer with what you remember.";
/// An incomplete grade is retried like a server error rather than scored as zero.
const GRADER_GAP_STATUS: u16 = 502;

/// The multiple-choice option a stored response picked.
pub fn chosen_index(response: Option<&str>) -> Option<i64> {
    response?.trim().parse().ok()
}

fn answered(q: &QuestionRow) -> Option<&str> {
    q.response
        .as_deref()
        .map(str::trim)
        .filter(|r| !r.is_empty())
}

pub fn mcq_points(q: &QuestionRow) -> f64 {
    let correct = q.answer_index.is_some() && chosen_index(q.response.as_deref()) == q.answer_index;
    if correct {
        1.0
    } else {
        0.0
    }
}

fn verdict_points(verdict: &str) -> f64 {
    match verdict {
        "met" => 1.0,
        "partial" => 0.5,
        _ => 0.0,
    }
}

fn render_question(q: &QuestionRow) -> String {
    let mut out = String::new();
    let head = |extra: &str| {
        format!(
            "<question seq=\"{}\" kind=\"{}\" topic=\"{}\"{extra}>\n<prompt>{}</prompt>\n",
            q.seq,
            q.kind,
            attr(&q.topic_name),
            escape(&q.prompt)
        )
    };
    if q.kind == "mcq" {
        let chosen = chosen_index(q.response.as_deref());
        let result = match chosen {
            None => "skipped",
            Some(_) if mcq_points(q) > 0.0 => "correct",
            Some(_) => "incorrect",
        };
        out.push_str(&head(&format!(" result=\"{result}\"")));
        for (i, choice) in q.choices.iter().enumerate() {
            out.push_str(&format!("<choice i=\"{i}\">{}</choice>\n", escape(choice)));
        }
        out.push_str(&format!(
            "<correct_choice>{}</correct_choice>\n",
            q.answer_index.unwrap_or(-1)
        ));
        if let Some(c) = chosen {
            out.push_str(&format!("<chosen_choice>{c}</chosen_choice>\n"));
        }
        out.push_str(&format!(
            "<explanation>{}</explanation>\n",
            escape(&q.explanation)
        ));
    } else {
        out.push_str(&head(""));
        for (i, point) in q.key_points.iter().enumerate() {
            out.push_str(&format!(
                "<key_point i=\"{i}\">{}</key_point>\n",
                escape(point)
            ));
        }
        out.push_str(&format!(
            "<model_answer>{}</model_answer>\n",
            escape(&q.explanation)
        ));
        match answered(q) {
            Some(r) => out.push_str(&format!("<response>{}</response>\n", escape(r))),
            None => out.push_str("<response skipped=\"true\"></response>\n"),
        }
    }
    let sources: Vec<String> = q.source_ids.iter().map(i64::to_string).collect();
    out.push_str(&format!(
        "<sources>{}</sources>\n</question>\n",
        sources.join(", ")
    ));
    out
}

pub fn render_test(questions: &[QuestionRow]) -> String {
    let body: String = questions.iter().map(render_question).collect();
    format!("<test>\n{body}</test>")
}

pub fn build_request(model: &str, material: &str, questions: &[QuestionRow]) -> MessageRequest {
    MessageRequest {
        model: model.to_owned(),
        max_tokens: MAX_TOKENS,
        system: vec![SystemBlock {
            kind: "text",
            text: GRADE_SYSTEM.to_owned(),
            cache_control: None,
        }],
        messages: vec![Message::user_text(format!(
            "{material}\n\n{}\n\nGrade the free responses and write the study guide.",
            render_test(questions)
        ))],
        output_config: Some(OutputConfig {
            format: Some(json!({"type": "json_schema", "schema": grade_schema()})),
            effort: Some(EFFORT),
        }),
        thinking: Some(json!({"type": "adaptive"})),
        fallbacks: refusal_fallback(model),
    }
}

#[derive(Deserialize)]
struct RawGrades {
    frq_grades: Vec<RawFrq>,
    guide: RawGuide,
}

#[derive(Deserialize)]
struct RawFrq {
    seq: i64,
    key_points: Vec<String>,
    feedback: String,
}

#[derive(Deserialize)]
struct RawGuide {
    overview: String,
    strengths: Vec<String>,
    sections: Vec<RawSection>,
    next_steps: Vec<String>,
}

#[derive(Deserialize)]
struct RawSection {
    topic: String,
    priority: String,
    why: String,
    key_ideas: Vec<String>,
    misconception: String,
    practice: Vec<String>,
    source_ids: Vec<i64>,
    question_seqs: Vec<i64>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct FrqGrade {
    pub question_id: i64,
    pub verdicts: Vec<String>,
    pub points: f64,
    pub feedback: String,
}

/// The study guide as stored on the review (ids; the DTO expands them).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct StoredGuide {
    pub overview: String,
    pub strengths: Vec<String>,
    pub sections: Vec<StoredSection>,
    pub next_steps: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct StoredSection {
    pub topic: String,
    pub topic_id: Option<i64>,
    pub priority: String,
    pub why: String,
    pub key_ideas: Vec<String>,
    pub misconception: String,
    pub practice: Vec<String>,
    pub source_ids: Vec<i64>,
    pub question_seqs: Vec<i64>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Graded {
    pub frq: Vec<FrqGrade>,
    pub guide: StoredGuide,
}

fn clean(items: Vec<String>) -> Vec<String> {
    items
        .into_iter()
        .map(|s| s.trim().to_owned())
        .filter(|s| !s.is_empty())
        .collect()
}

/// One verdict per key point. A skipped answer earns nothing whatever the reply says;
/// an answer the reply skipped or only partly graded is an error, so the job runs again
/// instead of scoring a real answer as zero.
fn grade_frq(q: &QuestionRow, raw: Option<&RawFrq>) -> AppResult<FrqGrade> {
    let skipped = answered(q).is_none();
    let verdicts: Vec<String> = if skipped {
        vec![MISSED.to_owned(); q.key_points.len()]
    } else {
        let given = raw.map(|r| r.key_points.as_slice()).unwrap_or_default();
        let complete = given.len() == q.key_points.len()
            && given.iter().all(|v| VERDICTS.contains(&v.as_str()));
        if !complete {
            return Err(AppError::Api {
                status: GRADER_GAP_STATUS,
                message: format!("the grader didn't grade every point of question {}", q.seq),
            });
        }
        given.to_vec()
    };
    let feedback = match raw.map(|r| r.feedback.trim()).filter(|f| !f.is_empty()) {
        Some(f) => f.to_owned(),
        None if skipped => SKIPPED_FEEDBACK.to_owned(),
        None => String::new(),
    };
    Ok(FrqGrade {
        question_id: q.id,
        points: verdicts.iter().map(|v| verdict_points(v)).sum(),
        verdicts,
        feedback,
    })
}

fn section(
    raw: RawSection,
    ideas: &HashMap<i64, &MaterialIdea>,
    seqs: &HashSet<i64>,
) -> StoredSection {
    let mut seen = HashSet::new();
    let source_ids: Vec<i64> = raw
        .source_ids
        .into_iter()
        .filter(|id| ideas.contains_key(id) && seen.insert(*id))
        .collect();
    let named = raw.topic.trim().to_lowercase();
    let topic_id = ideas
        .values()
        .find(|i| i.topic_name.to_lowercase() == named)
        .or_else(|| source_ids.first().and_then(|id| ideas.get(id)))
        .map(|i| i.topic_id);
    StoredSection {
        topic: raw.topic.trim().to_owned(),
        topic_id,
        priority: if PRIORITIES.contains(&raw.priority.as_str()) {
            raw.priority
        } else {
            FALLBACK_PRIORITY.to_owned()
        },
        why: raw.why.trim().to_owned(),
        key_ideas: clean(raw.key_ideas),
        misconception: raw.misconception.trim().to_owned(),
        practice: clean(raw.practice),
        source_ids,
        question_seqs: raw
            .question_seqs
            .into_iter()
            .filter(|s| seqs.contains(s))
            .collect(),
    }
}

pub fn parse(text: &str, questions: &[QuestionRow], ideas: &[MaterialIdea]) -> AppResult<Graded> {
    let raw: RawGrades = serde_json::from_str(text)?;
    let by_seq: HashMap<i64, &RawFrq> = raw.frq_grades.iter().map(|g| (g.seq, g)).collect();
    let frq = questions
        .iter()
        .filter(|q| q.kind == "frq")
        .map(|q| grade_frq(q, by_seq.get(&q.seq).copied()))
        .collect::<AppResult<_>>()?;
    let by_id: HashMap<i64, &MaterialIdea> = ideas.iter().map(|i| (i.id, i)).collect();
    let seqs: HashSet<i64> = questions.iter().map(|q| q.seq).collect();
    let rank = |p: &str| {
        PRIORITIES
            .iter()
            .position(|x| *x == p)
            .unwrap_or(PRIORITIES.len())
    };
    let mut sections: Vec<StoredSection> = raw
        .guide
        .sections
        .into_iter()
        .map(|s| section(s, &by_id, &seqs))
        .collect();
    sections.sort_by_key(|s| rank(&s.priority));
    Ok(Graded {
        frq,
        guide: StoredGuide {
            overview: raw.guide.overview.trim().to_owned(),
            strengths: clean(raw.guide.strengths),
            sections,
            next_steps: clean(raw.guide.next_steps),
        },
    })
}

/// Fraction of all points earned, 0..1.
pub fn score(questions: &[QuestionRow], frq: &[FrqGrade]) -> f64 {
    let frq_points: HashMap<i64, f64> = frq.iter().map(|g| (g.question_id, g.points)).collect();
    let max: f64 = questions.iter().map(|q| q.max_points).sum();
    let earned: f64 = questions
        .iter()
        .map(|q| match q.kind.as_str() {
            "mcq" => mcq_points(q),
            _ => frq_points.get(&q.id).copied().unwrap_or(0.0),
        })
        .sum();
    if max > 0.0 {
        (earned / max).clamp(0.0, 1.0)
    } else {
        0.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn question(id: i64, kind: &str, response: Option<&str>) -> QuestionRow {
        let mcq = kind == "mcq";
        QuestionRow {
            id,
            seq: id,
            kind: kind.into(),
            topic_id: Some(1),
            topic_name: "Decay".into(),
            difficulty: "recall".into(),
            prompt: format!("Question {id}?"),
            choices: if mcq {
                vec!["a".into(), "b".into(), "c".into(), "d".into()]
            } else {
                vec![]
            },
            answer_index: mcq.then_some(2),
            explanation: "why".into(),
            key_points: if mcq {
                vec![]
            } else {
                vec!["one".into(), "two".into()]
            },
            source_ids: vec![10],
            response: response.map(str::to_owned),
            points: None,
            max_points: if mcq { 1.0 } else { 2.0 },
            feedback: None,
            key_points_met: None,
        }
    }

    fn idea(id: i64, topic: i64, name: &str) -> MaterialIdea {
        MaterialIdea {
            id,
            topic_id: topic,
            topic_name: name.into(),
            title: String::new(),
            summary: String::new(),
            kind: "fact".into(),
            excerpt: String::new(),
            is_user: false,
            is_gem: false,
            at: String::new(),
        }
    }

    #[test]
    fn scores_multiple_choice_locally() {
        assert_eq!(mcq_points(&question(1, "mcq", Some("2"))), 1.0);
        assert_eq!(mcq_points(&question(1, "mcq", Some("0"))), 0.0);
        assert_eq!(mcq_points(&question(1, "mcq", None)), 0.0);
        assert_eq!(chosen_index(Some(" 3 ")), Some(3));
    }

    #[test]
    fn renders_results_rubrics_and_skips() {
        let text = render_test(&[
            question(1, "mcq", Some("0")),
            question(2, "frq", Some("my </response> answer")),
            question(3, "frq", Some("  ")),
        ]);

        assert!(
            text.contains("<question seq=\"1\" kind=\"mcq\" topic=\"Decay\" result=\"incorrect\">")
        );
        assert!(
            text.contains("<correct_choice>2</correct_choice>\n<chosen_choice>0</chosen_choice>")
        );
        assert!(text.contains("<key_point i=\"1\">two</key_point>"));
        assert!(text.contains("<response>my <\\/response> answer</response>"));
        assert!(text.contains("<question seq=\"3\" kind=\"frq\""));
        assert!(text.contains("<response skipped=\"true\"></response>"));
    }

    #[test]
    fn grades_free_responses_and_orders_the_guide_by_urgency() {
        let questions = [
            question(1, "mcq", Some("2")),
            question(2, "frq", Some("an answer")),
            question(3, "frq", None),
        ];
        let ideas = [idea(10, 1, "Decay"), idea(11, 2, "Robot arm")];
        let reply = json!({
            "frq_grades": [
                {"seq": 2, "key_points": ["met", "partial"], "feedback": "Good on one."},
                {"seq": 3, "key_points": ["met", "met"], "feedback": ""}
            ],
            "guide": {
                "overview": " Mostly there. ", "strengths": ["decay basics", " "],
                "sections": [
                    {"topic": "decay", "priority": "solid", "why": "w", "key_ideas": ["k"], "misconception": "",
                     "practice": ["p"], "source_ids": [10, 99], "question_seqs": [1, 42]},
                    {"topic": "Something else", "priority": "review_now", "why": "w", "key_ideas": [], "misconception": "m",
                     "practice": [], "source_ids": [11], "question_seqs": [2]}
                ],
                "next_steps": ["Retest Friday"]
            }
        })
        .to_string();

        let graded = parse(&reply, &questions, &ideas).unwrap();

        assert_eq!(graded.frq.len(), 2);
        assert_eq!(
            (graded.frq[0].points, graded.frq[0].verdicts.clone()),
            (1.5, vec!["met".to_string(), "partial".to_string()])
        );
        assert_eq!(graded.frq[1].points, 0.0, "a skipped answer earns nothing");
        assert_eq!(graded.frq[1].feedback, SKIPPED_FEEDBACK);
        let guide = &graded.guide;
        assert_eq!(guide.overview, "Mostly there.");
        assert_eq!(guide.strengths, vec!["decay basics"]);
        assert_eq!(guide.sections[0].priority, "review_now");
        assert_eq!(
            guide.sections[0].topic_id,
            Some(2),
            "unknown name falls back to the source's topic"
        );
        assert_eq!(
            guide.sections[1].topic_id,
            Some(1),
            "names match case-insensitively"
        );
        assert_eq!(guide.sections[1].source_ids, vec![10]);
        assert_eq!(guide.sections[1].question_seqs, vec![1]);

        // 1 (mcq) + 1.5 + 0 out of 1 + 2 + 2.
        assert!((score(&questions, &graded.frq) - 2.5 / 5.0).abs() < 1e-9);
    }

    #[test]
    fn an_answer_the_grader_skipped_is_retried_rather_than_scored_zero() {
        let questions = [question(2, "frq", Some("an answer"))];
        let guide = json!({"overview": "", "strengths": [], "sections": [], "next_steps": []});
        let missing = json!({"frq_grades": [], "guide": guide}).to_string();
        let short = json!({"frq_grades": [{"seq": 2, "key_points": ["met"], "feedback": "f"}], "guide": guide})
            .to_string();

        for reply in [missing, short] {
            let error = parse(&reply, &questions, &[]).unwrap_err();
            assert!(error.is_retryable(), "{error}");
        }
    }
}
