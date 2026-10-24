//! Writing the test: the request, and turning Claude's questions into validated drafts.

use std::collections::{HashMap, HashSet};

use serde::Deserialize;
use serde_json::json;

use super::material::MaterialIdea;
use super::prompt::{quiz_instructions, quiz_schema, DIFFICULTIES, QUIZ_SYSTEM};
use crate::config::review::{
    EFFORT, FRQ_RANGE, IDEAS_PER_FRQ, IDEAS_PER_MCQ, MAX_TOKENS, MCQ_RANGE,
};
use crate::error::{AppError, AppResult};
use crate::llm::refusal_fallback;
use crate::llm::types::{Message, MessageRequest, OutputConfig, SystemBlock};

/// The prompt asks for 4 options; tolerate 3 or 5 rather than drop a good question.
const CHOICES_RANGE: (usize, usize) = (3, 5);
const MAX_KEY_POINTS: usize = 6;
const DEFAULT_DIFFICULTY: &str = "recall";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Kind {
    Mcq,
    Frq,
}

impl Kind {
    pub fn as_str(self) -> &'static str {
        match self {
            Kind::Mcq => "mcq",
            Kind::Frq => "frq",
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct QuestionDraft {
    pub kind: Kind,
    pub topic_id: i64,
    pub topic_name: String,
    pub difficulty: String,
    pub prompt: String,
    pub choices: Vec<String>,
    pub answer_index: Option<i64>,
    pub explanation: String,
    pub key_points: Vec<String>,
    pub source_ids: Vec<i64>,
}

impl QuestionDraft {
    /// One point per multiple-choice question; one per key point for free response.
    pub fn max_points(&self) -> f64 {
        match self.kind {
            Kind::Mcq => 1.0,
            Kind::Frq => self.key_points.len() as f64,
        }
    }
}

/// How many multiple-choice and free-response questions to ask for `ideas` ideas.
pub fn counts(ideas: usize) -> (usize, usize) {
    (
        (ideas / IDEAS_PER_MCQ).clamp(MCQ_RANGE.0, MCQ_RANGE.1),
        (ideas / IDEAS_PER_FRQ).clamp(FRQ_RANGE.0, FRQ_RANGE.1),
    )
}

pub fn build_request(model: &str, material: &str, mcq: usize, frq: usize) -> MessageRequest {
    MessageRequest {
        model: model.to_owned(),
        max_tokens: MAX_TOKENS,
        system: vec![SystemBlock {
            kind: "text",
            text: QUIZ_SYSTEM.to_owned(),
            cache_control: None,
        }],
        messages: vec![Message::user_text(format!(
            "{material}\n\n{}",
            quiz_instructions(mcq, frq)
        ))],
        output_config: Some(OutputConfig {
            format: Some(json!({"type": "json_schema", "schema": quiz_schema()})),
            effort: Some(EFFORT),
        }),
        thinking: Some(json!({"type": "adaptive"})),
        fallbacks: refusal_fallback(model),
    }
}

#[derive(Deserialize)]
struct RawQuiz {
    questions: Vec<RawQuestion>,
}

#[derive(Deserialize)]
struct RawQuestion {
    kind: String,
    difficulty: String,
    prompt: String,
    choices: Vec<String>,
    answer_index: i64,
    explanation: String,
    key_points: Vec<String>,
    source_ids: Vec<i64>,
}

/// Keeps the questions that are well formed and grounded in the given ideas, up to the
/// requested counts, multiple choice first. Errors only when none survive.
pub fn parse(
    text: &str,
    ideas: &[MaterialIdea],
    mcq: usize,
    frq: usize,
) -> AppResult<Vec<QuestionDraft>> {
    let raw: RawQuiz = serde_json::from_str(text)?;
    let by_id: HashMap<i64, &MaterialIdea> = ideas.iter().map(|i| (i.id, i)).collect();
    let mut prompts = HashSet::new();
    let (mut mcqs, mut frqs) = (Vec::new(), Vec::new());
    for draft in raw
        .questions
        .into_iter()
        .filter_map(|q| validate(q, &by_id))
    {
        if !prompts.insert(draft.prompt.to_lowercase()) {
            continue;
        }
        match draft.kind {
            Kind::Mcq if mcqs.len() < mcq => mcqs.push(draft),
            Kind::Frq if frqs.len() < frq => frqs.push(draft),
            _ => {}
        }
    }
    mcqs.extend(frqs);
    if mcqs.is_empty() {
        return Err(AppError::Api {
            status: 200,
            message: "none of the questions Claude wrote were usable".into(),
        });
    }
    Ok(mcqs)
}

fn validate(q: RawQuestion, by_id: &HashMap<i64, &MaterialIdea>) -> Option<QuestionDraft> {
    let prompt = q.prompt.trim().to_owned();
    if prompt.is_empty() {
        return None;
    }
    let mut seen = HashSet::new();
    let source_ids: Vec<i64> = q
        .source_ids
        .into_iter()
        .filter(|id| by_id.contains_key(id) && seen.insert(*id))
        .collect();
    let first = by_id.get(source_ids.first()?)?;
    let difficulty = if DIFFICULTIES.contains(&q.difficulty.as_str()) {
        q.difficulty
    } else {
        DEFAULT_DIFFICULTY.to_owned()
    };
    let base = QuestionDraft {
        kind: Kind::Mcq,
        topic_id: first.topic_id,
        topic_name: first.topic_name.clone(),
        difficulty,
        prompt,
        choices: Vec::new(),
        answer_index: None,
        explanation: q.explanation.trim().to_owned(),
        key_points: Vec::new(),
        source_ids,
    };
    match q.kind.as_str() {
        "mcq" => {
            let choices: Vec<String> = q.choices.iter().map(|c| c.trim().to_owned()).collect();
            let distinct: HashSet<String> = choices.iter().map(|c| c.to_lowercase()).collect();
            let index = usize::try_from(q.answer_index).ok()?;
            let ok = (CHOICES_RANGE.0..=CHOICES_RANGE.1).contains(&choices.len())
                && distinct.len() == choices.len()
                && choices.iter().all(|c| !c.is_empty())
                && index < choices.len();
            ok.then_some(QuestionDraft {
                choices,
                answer_index: Some(q.answer_index),
                ..base
            })
        }
        "frq" => {
            let key_points: Vec<String> = q
                .key_points
                .iter()
                .map(|p| p.trim().to_owned())
                .filter(|p| !p.is_empty())
                .take(MAX_KEY_POINTS)
                .collect();
            let has_rubric = !key_points.is_empty();
            has_rubric.then_some(QuestionDraft {
                kind: Kind::Frq,
                key_points,
                ..base
            })
        }
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

    fn idea(id: i64, topic: i64) -> MaterialIdea {
        MaterialIdea {
            id,
            topic_id: topic,
            topic_name: format!("Topic {topic}"),
            title: String::new(),
            summary: String::new(),
            kind: "fact".into(),
            excerpt: String::new(),
            is_user: false,
            is_gem: false,
            at: String::new(),
        }
    }

    fn mcq(prompt: &str, choices: &[&str], answer: i64, sources: &[i64]) -> Value {
        json!({"kind": "mcq", "difficulty": "recall", "prompt": prompt, "choices": choices,
               "answer_index": answer, "explanation": "because", "key_points": [], "source_ids": sources})
    }

    fn frq(prompt: &str, points: &[&str], sources: &[i64]) -> Value {
        json!({"kind": "frq", "difficulty": "apply", "prompt": prompt, "choices": [],
               "answer_index": -1, "explanation": "model answer", "key_points": points, "source_ids": sources})
    }

    #[test]
    fn question_counts_scale_with_material_within_bounds() {
        assert_eq!(counts(5), (4, 2));
        assert_eq!(counts(14), (7, 2));
        assert_eq!(counts(36), (10, 3));
        assert_eq!(counts(80), (10, 4));
    }

    #[test]
    fn keeps_grounded_well_formed_questions_multiple_choice_first() {
        let ideas = [idea(10, 1), idea(11, 2)];
        let text = json!({"questions": [
            frq("Explain decay.", &["half-life", " ", "message time"], &[11, 99]),
            mcq("What is X?", &["a", "b", "c", "d"], 2, &[10]),
            mcq("Ungrounded?", &["a", "b", "c", "d"], 0, &[99]),
            mcq("Bad index?", &["a", "b", "c", "d"], 4, &[10]),
            mcq("Duplicate options?", &["a", "A", "c", "d"], 0, &[10]),
            mcq("what is x?", &["e", "f", "g", "h"], 1, &[10]),
            frq("No rubric?", &[], &[10]),
        ]})
        .to_string();

        let drafts = parse(&text, &ideas, 10, 4).unwrap();

        let prompts: Vec<&str> = drafts.iter().map(|d| d.prompt.as_str()).collect();
        assert_eq!(prompts, vec!["What is X?", "Explain decay."]);
        assert_eq!(drafts[0].answer_index, Some(2));
        assert_eq!(drafts[0].max_points(), 1.0);
        let written = &drafts[1];
        assert_eq!(written.kind, Kind::Frq);
        assert_eq!(written.key_points, vec!["half-life", "message time"]);
        assert_eq!(written.source_ids, vec![11]);
        assert_eq!(
            (written.topic_id, written.topic_name.as_str()),
            (2, "Topic 2")
        );
        assert_eq!(written.max_points(), 2.0);
    }

    #[test]
    fn caps_each_kind_and_errors_when_nothing_survives() {
        let ideas = [idea(10, 1)];
        let text = json!({"questions": [
            mcq("One?", &["a", "b", "c", "d"], 0, &[10]),
            mcq("Two?", &["a", "b", "c", "d"], 1, &[10]),
        ]})
        .to_string();
        assert_eq!(parse(&text, &ideas, 1, 1).unwrap().len(), 1);

        let none = json!({"questions": [mcq("Q?", &["a", "b", "c", "d"], 0, &[42])]}).to_string();
        assert_eq!(parse(&none, &ideas, 5, 2).unwrap_err().code(), "api_error");
        assert_eq!(
            parse("not json", &ideas, 5, 2).unwrap_err().code(),
            "bad_json"
        );
    }

    #[test]
    fn requests_adaptive_thinking_structured_output_and_opus_fallback() {
        let body =
            serde_json::to_value(build_request("claude-opus-5-5", "<week></week>", 6, 2)).unwrap();

        assert_eq!(body["model"], "claude-opus-5-5");
        assert_eq!(body["thinking"]["type"], "adaptive");
        assert_eq!(body["output_config"]["format"]["type"], "json_schema");
        assert_eq!(body["output_config"]["effort"], "high");
        assert_eq!(body["fallbacks"], "default");
        assert!(body["messages"][0]["content"]
            .as_str()
            .unwrap()
            .contains("Write 6 multiple-choice and 2 free-response"));
        assert!(body.get("temperature").is_none());

        let opus_5 = serde_json::to_value(build_request("claude-opus-5", "", 4, 2)).unwrap();
        assert_eq!(opus_5["fallbacks"], "default");
        let sonnet = serde_json::to_value(build_request("claude-sonnet-5", "", 4, 2)).unwrap();
        assert!(sonnet.get("fallbacks").is_none());
    }
}
