//! The `POST /capture` body (v1) and its validation. Nothing from the request is trusted:
//! ids are checked, sizes are capped, and the stored URL is built here.

use chrono::{DateTime, Utc};
use serde::Deserialize;

use super::merge::Turn;
use crate::config::capture::{MAX_TITLE_CHARS, MAX_TURNS, MAX_TURN_CHARS};
use crate::error::{AppError, AppResult};
use crate::ingest::model::Role;

const VERSION: u32 = 1;
const SOURCE: &str = "gemini";
const MAX_ID_CHARS: usize = 64;
/// Gemini launched after this; earlier capture times mean a broken client clock.
const EARLIEST_CAPTURE: &str = "2023-01-01T00:00:00Z";

#[derive(Debug, Deserialize)]
pub struct CapturePayload {
    pub v: u32,
    pub source: String,
    pub conversation: ConversationIn,
    pub turns: Vec<TurnIn>,
}

#[derive(Debug, Deserialize)]
pub struct ConversationIn {
    pub source_id: String,
    #[serde(default)]
    pub gem_id: Option<String>,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub from_start: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct TurnIn {
    pub role: String,
    pub text: String,
    pub captured_at: String,
}

/// A validated capture, ready to merge.
#[derive(Debug, Clone, PartialEq)]
pub struct Capture {
    pub source_id: String,
    pub url: String,
    pub title: Option<String>,
    pub from_start: bool,
    pub turns: Vec<Turn>,
}

fn invalid(message: impl Into<String>) -> AppError {
    AppError::InvalidInput(message.into())
}

fn valid_id(id: &str) -> bool {
    (1..=MAX_ID_CHARS).contains(&id.len())
        && id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
}

fn role(raw: &str) -> AppResult<Role> {
    match raw {
        "user" => Ok(Role::User),
        "model" => Ok(Role::Assistant),
        other => Err(invalid(format!("unknown turn role {other:?}"))),
    }
}

/// Control characters dropped, whitespace collapsed, cut to the title limit.
fn clean_title(raw: &str) -> Option<String> {
    let title: String = raw
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .chars()
        .filter(|c| !c.is_control())
        .take(MAX_TITLE_CHARS)
        .collect();
    (!title.is_empty()).then_some(title)
}

fn turn(raw: TurnIn, earliest: DateTime<Utc>) -> AppResult<Turn> {
    if raw.text.chars().count() > MAX_TURN_CHARS {
        return Err(invalid(format!("a turn is longer than {MAX_TURN_CHARS} characters")));
    }
    let captured_at = DateTime::parse_from_rfc3339(&raw.captured_at)
        .map_err(|_| invalid("captured_at must be an RFC 3339 time"))?
        .with_timezone(&Utc);
    if captured_at < earliest {
        return Err(invalid("captured_at is before Gemini existed"));
    }
    Ok(Turn {
        role: role(&raw.role)?,
        text: raw.text,
        captured_at,
    })
}

pub fn validate(payload: CapturePayload) -> AppResult<Capture> {
    if payload.v != VERSION {
        return Err(invalid(format!("unsupported payload version {}", payload.v)));
    }
    if payload.source != SOURCE {
        return Err(invalid(format!("unsupported source {:?}", payload.source)));
    }
    let conv = payload.conversation;
    if !valid_id(&conv.source_id) {
        return Err(invalid("source_id must be 1-64 letters, digits, - or _"));
    }
    let url = match conv.gem_id.as_deref() {
        Some(gem) if !valid_id(gem) => return Err(invalid("gem_id must be 1-64 letters, digits, - or _")),
        Some(gem) => format!("https://gemini.google.com/gem/{gem}/{}", conv.source_id),
        None => format!("https://gemini.google.com/app/{}", conv.source_id),
    };
    if payload.turns.is_empty() || payload.turns.len() > MAX_TURNS {
        return Err(invalid(format!("send between 1 and {MAX_TURNS} turns")));
    }
    let earliest = DateTime::parse_from_rfc3339(EARLIEST_CAPTURE)
        .map_err(|e| AppError::internal(e.to_string()))?
        .with_timezone(&Utc);
    let turns = payload
        .turns
        .into_iter()
        .map(|t| turn(t, earliest))
        .collect::<AppResult<Vec<_>>>()?;
    Ok(Capture {
        source_id: conv.source_id,
        url,
        title: conv.title.as_deref().and_then(clean_title),
        from_start: conv.from_start.unwrap_or(false),
        turns,
    })
}

#[cfg(test)]
#[path = "payload_tests.rs"]
mod tests;
