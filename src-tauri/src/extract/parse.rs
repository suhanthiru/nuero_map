//! Parses and validates Claude's extraction output against the window it came from.
//! Invalid indices are dropped, and excerpts are checked to be verbatim.

use std::collections::{BTreeSet, HashMap};

use serde::Deserialize;

use super::prompt::KINDS;
use super::request::unescape;
use super::windows::Part;
use crate::error::{AppError, AppResult};

#[derive(Debug, Deserialize)]
struct Extraction {
    ideas: Vec<RawIdea>,
}

#[derive(Debug, Deserialize)]
struct RawIdea {
    title: String,
    summary: String,
    kind: String,
    topic_label: String,
    #[serde(default)]
    topic_aliases: Vec<String>,
    #[serde(default)]
    source_message_indices: Vec<i64>,
    excerpt: String,
    is_user_originated: bool,
    gem_candidate: bool,
    #[serde(default)]
    related_idea_indices: Vec<i64>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ValidIdea {
    pub idea_index: usize,
    pub title: String,
    pub summary: String,
    pub kind: String,
    pub topic_label: String,
    pub aliases: Vec<String>,
    pub message_ids: Vec<i64>,
    pub excerpt: String,
    pub excerpt_verified: bool,
    pub is_user_originated: bool,
    pub gem_candidate: bool,
    /// Positions (idea_index) of other ideas in the same window this one builds on.
    pub related: Vec<usize>,
    pub first_message_at: String,
}

fn normalize(text: &str) -> String {
    text.split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase()
}

/// Maps local indices to the parts they point at; drops out-of-range indices.
fn cited_parts<'a>(indices: &[i64], parts: &'a [Part]) -> Vec<&'a Part> {
    let valid: BTreeSet<usize> = indices
        .iter()
        .filter_map(|&i| usize::try_from(i).ok())
        .filter(|&i| i < parts.len())
        .collect();
    valid.into_iter().map(|i| &parts[i]).collect()
}

fn verify_excerpt(excerpt: &str, cited: &[&Part], full_text: &HashMap<i64, String>) -> bool {
    let needle = normalize(&unescape(excerpt));
    !needle.is_empty()
        && cited.iter().any(|p| {
            let haystack = full_text.get(&p.message_id).unwrap_or(&p.text);
            normalize(haystack).contains(&needle)
        })
}

fn clean_aliases(aliases: Vec<String>, label: &str) -> Vec<String> {
    let mut seen = BTreeSet::new();
    aliases
        .into_iter()
        .map(|a| a.trim().to_owned())
        .filter(|a| !a.is_empty() && !a.eq_ignore_ascii_case(label))
        .filter(|a| seen.insert(a.to_lowercase()))
        .collect()
}

fn validate(
    index: usize,
    raw: RawIdea,
    count: usize,
    parts: &[Part],
    full_text: &HashMap<i64, String>,
) -> Option<ValidIdea> {
    let cited = cited_parts(&raw.source_message_indices, parts);
    if cited.is_empty() || raw.title.trim().is_empty() || raw.topic_label.trim().is_empty() {
        return None;
    }
    let mut message_ids: Vec<i64> = cited.iter().map(|p| p.message_id).collect();
    message_ids.dedup();
    let excerpt_verified = verify_excerpt(&raw.excerpt, &cited, full_text);
    let first_message_at = cited
        .iter()
        .map(|p| p.created_at.clone())
        .min()
        .unwrap_or_default();
    let related = raw
        .related_idea_indices
        .iter()
        .filter_map(|&i| usize::try_from(i).ok())
        .filter(|&i| i < count && i != index)
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect();
    let topic_label = raw.topic_label.trim().to_owned();
    Some(ValidIdea {
        idea_index: index,
        title: raw.title.trim().to_owned(),
        summary: raw.summary.trim().to_owned(),
        kind: if KINDS.contains(&raw.kind.as_str()) {
            raw.kind
        } else {
            "insight".to_owned()
        },
        aliases: clean_aliases(raw.topic_aliases, &topic_label),
        topic_label,
        message_ids,
        excerpt: unescape(raw.excerpt.trim()),
        excerpt_verified,
        is_user_originated: raw.is_user_originated,
        // A gem is only trustworthy if its quote is verbatim.
        gem_candidate: raw.gem_candidate && excerpt_verified,
        related,
        first_message_at,
    })
}

/// `full_text` maps message ids to their complete text (parts may be slices).
/// Returns the valid ideas and how many were dropped.
pub fn parse_extraction(
    json_text: &str,
    parts: &[Part],
    full_text: &HashMap<i64, String>,
) -> AppResult<(Vec<ValidIdea>, usize)> {
    let extraction: Extraction =
        serde_json::from_str(json_text.trim()).map_err(|e| AppError::Api {
            status: 200,
            message: format!("extraction output was not valid JSON for the schema: {e}"),
        })?;
    let count = extraction.ideas.len();
    let valid: Vec<ValidIdea> = extraction
        .ideas
        .into_iter()
        .enumerate()
        .filter_map(|(i, raw)| validate(i, raw, count, parts, full_text))
        .collect();
    let dropped = count - valid.len();
    // Relations may point at dropped ideas; keep only links to survivors.
    let kept: BTreeSet<usize> = valid.iter().map(|v| v.idea_index).collect();
    let valid = valid
        .into_iter()
        .map(|v| ValidIdea {
            related: v
                .related
                .iter()
                .copied()
                .filter(|r| kept.contains(r))
                .collect(),
            ..v
        })
        .collect();
    Ok((valid, dropped))
}

#[cfg(test)]
#[path = "parse_tests.rs"]
mod tests;
