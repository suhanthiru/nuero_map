//! Splits a conversation's active branch into extraction windows that fit one request.
//! Planning is deterministic and incremental: windows whose messages are unchanged are
//! kept, and new windows start after them (so appending to a chat re-extracts only the
//! new part, with a little read-only context from before).

use sha2::{Digest, Sha256};

use crate::config::windows::{OVERLAP_MAX_CHARS, OVERLAP_MESSAGES, TARGET_TOKENS};
use crate::config::CHARS_PER_TOKEN;
use crate::ingest::fingerprint::hex;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WindowMessage {
    pub message_id: i64,
    pub seq: i64,
    pub role: String,
    pub text: String,
    pub created_at: String,
}

/// One message, or one slice of an oversize message.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Part {
    pub message_id: i64,
    pub seq: i64,
    pub role: String,
    pub text: String,
    pub created_at: String,
    pub part_index: usize,
    pub part_count: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PlannedWindow {
    pub first_seq: i64,
    pub last_seq: i64,
    pub part_index: usize,
    pub part_count: usize,
    pub context: Vec<Part>,
    pub parts: Vec<Part>,
    pub hash: String,
}

/// What a previously planned window covered, for the keep/replan decision.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ExistingWindow {
    pub first_seq: i64,
    pub last_seq: i64,
    pub part_index: usize,
    pub part_count: usize,
    pub hash: String,
}

pub fn budget_chars() -> usize {
    (TARGET_TOKENS as f64 * CHARS_PER_TOKEN) as usize
}

/// Splits text into chunks of at most `max` chars, preferring paragraph then line breaks.
fn split_text(text: &str, max: usize) -> Vec<String> {
    let mut chunks = Vec::new();
    let mut rest = text;
    while rest.chars().count() > max {
        let limit = rest.char_indices().nth(max).map_or(rest.len(), |(i, _)| i);
        let head = &rest[..limit];
        let paragraph_end = head.rfind("\n\n").map(|i| i + 2);
        let line_end = head.rfind('\n').map(|i| i + 1);
        let cut = paragraph_end
            .or(line_end)
            .filter(|&end| end > limit / 2)
            .unwrap_or(limit);
        chunks.push(rest[..cut].to_owned());
        rest = &rest[cut..];
    }
    chunks.push(rest.to_owned());
    chunks
}

fn parts_of(message: &WindowMessage, max: usize) -> Vec<Part> {
    let texts = split_text(&message.text, max);
    let count = texts.len();
    texts
        .into_iter()
        .enumerate()
        .map(|(i, text)| Part {
            message_id: message.message_id,
            seq: message.seq,
            role: message.role.clone(),
            text,
            created_at: message.created_at.clone(),
            part_index: i,
            part_count: count,
        })
        .collect()
}

pub fn hash_parts(parts: &[Part]) -> String {
    let mut h = Sha256::new();
    for p in parts {
        h.update(p.message_id.to_le_bytes());
        h.update((p.part_index as u64).to_le_bytes());
        h.update(p.text.as_bytes());
        h.update([0x1e]);
    }
    hex(&h.finalize())
}

/// Read-only context: the tail of the previous window, capped in size.
pub fn context_from(previous: &[Part]) -> Vec<Part> {
    let start = previous.len().saturating_sub(OVERLAP_MESSAGES);
    let mut remaining = OVERLAP_MAX_CHARS;
    let mut context: Vec<Part> = Vec::new();
    for part in previous[start..].iter().rev() {
        if remaining == 0 {
            break;
        }
        let chars: Vec<char> = part.text.chars().collect();
        let keep = chars.len().min(remaining);
        let tail: String = chars[chars.len() - keep..].iter().collect();
        remaining -= keep;
        context.push(Part {
            text: tail,
            ..part.clone()
        });
    }
    context.reverse();
    context
}

fn finish(parts: Vec<Part>, context: Vec<Part>) -> PlannedWindow {
    let first = &parts[0];
    let last = &parts[parts.len() - 1];
    let (part_index, part_count) = if parts.len() == 1 {
        (first.part_index, first.part_count)
    } else {
        (0, 1)
    };
    PlannedWindow {
        first_seq: first.seq,
        last_seq: last.seq,
        part_index,
        part_count,
        hash: hash_parts(&parts),
        context,
        parts,
    }
}

/// Greedy packing of `messages` into windows. `lead_in` supplies context for the first.
pub fn plan(messages: &[WindowMessage], lead_in: &[Part]) -> Vec<PlannedWindow> {
    let budget = budget_chars();
    let all_parts: Vec<Part> = messages.iter().flat_map(|m| parts_of(m, budget)).collect();
    let mut windows = Vec::new();
    let mut current: Vec<Part> = Vec::new();
    let mut used = 0;
    let mut previous: Vec<Part> = lead_in.to_vec();
    for part in all_parts {
        let size = part.text.chars().count();
        let is_split = part.part_count > 1;
        let crosses =
            !current.is_empty() && (used + size > budget || is_split || current[0].part_count > 1);
        if crosses {
            let parts = std::mem::take(&mut current);
            let window = finish(parts, context_from(&previous));
            previous = window.parts.clone();
            windows.push(window);
            used = 0;
        }
        used += size;
        current.push(part);
    }
    if !current.is_empty() {
        windows.push(finish(current, context_from(&previous)));
    }
    windows
}

/// Recomputes the hash an existing window would have over the current messages.
fn current_hash(existing: &ExistingWindow, messages: &[WindowMessage]) -> Option<String> {
    let budget = budget_chars();
    let parts: Vec<Part> = messages
        .iter()
        .filter(|m| m.seq >= existing.first_seq && m.seq <= existing.last_seq)
        .flat_map(|m| parts_of(m, budget))
        .filter(|p| existing.part_count == 1 || p.part_index == existing.part_index)
        .collect();
    (!parts.is_empty()).then(|| hash_parts(&parts))
}

/// How many leading existing windows are still valid, ending on a whole-message boundary.
pub fn valid_prefix(existing: &[ExistingWindow], messages: &[WindowMessage]) -> usize {
    let mut keep = existing
        .iter()
        .take_while(|w| current_hash(w, messages).as_deref() == Some(w.hash.as_str()))
        .count();
    // Never stop partway through a split message.
    while keep > 0 && existing[keep - 1].part_index + 1 < existing[keep - 1].part_count {
        keep -= 1;
    }
    keep
}

/// Parts of the messages at or before `last_seq`, for lead-in context after kept windows.
pub fn tail_parts(messages: &[WindowMessage], last_seq: i64) -> Vec<Part> {
    let budget = budget_chars();
    messages
        .iter()
        .filter(|m| m.seq <= last_seq)
        .rev()
        .take(OVERLAP_MESSAGES)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .flat_map(|m| parts_of(m, budget))
        .collect()
}

#[cfg(test)]
#[path = "windows_tests.rs"]
mod tests;
