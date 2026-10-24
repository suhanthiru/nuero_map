//! Lines a snapshot of the turns on screen up against the stored active branch.
//!
//! The extension sends every finished turn it can see, in order. Gemini shows one
//! unbroken stretch of a chat that reaches its latest turn, so the snapshot is matched
//! against what is stored. Every stored turn the snapshot agrees with keeps its row, seq
//! and time, which keeps its extraction window (and the ideas and pinned gems from it).
//! Turns are only replaced where the snapshot really differs: a regenerated reply or an
//! edited prompt. A snapshot that stops early (a chat still loading) never truncates.

use std::collections::HashSet;

use chrono::{DateTime, Duration, Utc};
use sha2::{Digest, Sha256};

use crate::config::capture::{CLOCK_SKEW_SECS, GAP_STRIDE, SEQ_BASE};
use crate::ingest::fingerprint::hex;
use crate::ingest::model::{NormalizedMessage, Role};

/// One finished turn from the extension, already validated.
#[derive(Debug, Clone, PartialEq)]
pub struct Turn {
    pub role: Role,
    pub text: String,
    pub captured_at: DateTime<Utc>,
}

#[derive(Debug, Clone, PartialEq, Default)]
pub struct Merged {
    pub messages: Vec<NormalizedMessage>,
    /// Stored turns were replaced (a regenerate or an edit), not just added to.
    pub branch_changed: bool,
    /// There was no room to place turns, so every seq was rewritten (a full re-plan).
    pub renumbered: bool,
}

/// A message on its way into the branch; seq is wide so placement can't overflow.
struct Draft {
    id: String,
    role: Role,
    text: String,
    created_at: DateTime<Utc>,
    seq: i64,
}

impl Draft {
    fn kept(m: &NormalizedMessage) -> Self {
        Self {
            id: m.source_msg_id.clone(),
            role: m.role,
            text: m.text.clone(),
            created_at: m.created_at,
            seq: i64::from(m.seq),
        }
    }
}

pub fn merge(
    stored: &[NormalizedMessage],
    incoming: &[Turn],
    from_start: bool,
    now: DateTime<Utc>,
) -> Merged {
    let snapshot: Vec<Turn> = incoming
        .iter()
        .map(|t| Turn {
            text: clean(&t.text),
            ..t.clone()
        })
        .filter(|t| !t.text.is_empty())
        .collect();
    let latest = now + Duration::seconds(CLOCK_SKEW_SECS);
    let kept = |range: &[NormalizedMessage]| range.iter().map(Draft::kept).collect::<Vec<_>>();
    if snapshot.is_empty() {
        return finish(kept(stored), false);
    }

    let a: Vec<String> = stored.iter().map(|m| loose(m.role, &m.text)).collect();
    let s: Vec<String> = snapshot.iter().map(|t| loose(t.role, &t.text)).collect();
    let Some((k, j, run)) = best_alignment(&a, &s) else {
        if stored.is_empty() || from_start {
            let mut out = Vec::new();
            append(&mut out, &snapshot, SEQ_BASE, latest);
            return finish(out, !stored.is_empty());
        }
        // Nothing in common: a later stretch of a chat continued elsewhere.
        let mut out = kept(stored);
        let start = out.last().map_or(SEQ_BASE, |d| d.seq + GAP_STRIDE);
        append(&mut out, &snapshot, start, latest);
        return finish(out, false);
    };

    // Before the match: older turns that just loaded are prepended. Unmatched turns
    // before a match further in are treated as rendering drift and ignored.
    let mut out = if k == 0 && j > 0 {
        prepend(&snapshot[..j], &stored[0])
    } else {
        kept(&stored[..k])
    };
    out.extend(kept(&stored[k..k + run]));

    let (rest_a, rest_s) = (k + run, j + run);
    let mut branch_changed = false;
    if rest_s == snapshot.len() {
        out.extend(kept(&stored[rest_a..]));
    } else {
        branch_changed = rest_a < stored.len();
        let start = out.last().map_or(SEQ_BASE, |d| d.seq + 1);
        append(&mut out, &snapshot[rest_s..], start, latest);
    }
    finish(out, branch_changed)
}

/// CRLF to LF and trimmed; the text as stored.
fn clean(text: &str) -> String {
    text.replace("\r\n", "\n").trim().to_owned()
}

/// Whitespace runs collapsed; what a new turn's id is derived from.
fn strict(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Equality key that survives cosmetic re-rendering: role plus lowercase letters and
/// digits. Text with neither (emoji only) falls back to the whitespace-collapsed text.
fn loose(role: Role, text: &str) -> String {
    let alnum: String = text
        .chars()
        .filter(|c| c.is_alphanumeric())
        .flat_map(char::to_lowercase)
        .collect();
    if alnum.is_empty() {
        format!("{}\u{2}{}", role.as_str(), strict(text))
    } else {
        format!("{}\u{1}{alnum}", role.as_str())
    }
}

/// The (stored k, snapshot j, length) of the best run of matching turns: longest first,
/// then one that reaches the end of either list, then the latest stored position.
fn best_alignment(a: &[String], s: &[String]) -> Option<(usize, usize, usize)> {
    let (n, m) = (a.len(), s.len());
    let width = m + 1;
    let mut run = vec![0usize; (n + 1) * width];
    let mut best: Option<(usize, bool, usize, usize)> = None;
    for k in (0..n).rev() {
        for j in (0..m).rev() {
            if a[k] != s[j] {
                continue;
            }
            let r = run[(k + 1) * width + j + 1] + 1;
            run[k * width + j] = r;
            let candidate = (r, k + r == n || j + r == m, k, j);
            if best.map_or(true, |b| (candidate.0, candidate.1, candidate.2) > (b.0, b.1, b.2)) {
                best = Some(candidate);
            }
        }
    }
    best.map(|(r, _, k, j)| (k, j, r))
}

/// A new turn's id: chained on the turn before it, so a re-sent snapshot reproduces the
/// same ids and switching back to an earlier draft revives the same row.
fn turn_id(prev_id: &str, role: Role, text: &str) -> String {
    let mut h = Sha256::new();
    for field in ["g1", prev_id, role.as_str(), &strict(text)] {
        h.update(field.as_bytes());
        h.update([0x1f]);
    }
    hex(&h.finalize())[..32].to_owned()
}

/// Adds `turns` after `out`, the first at `first_seq`. Times never go backwards and
/// never run ahead of `latest`.
fn append(out: &mut Vec<Draft>, turns: &[Turn], first_seq: i64, latest: DateTime<Utc>) {
    for (i, t) in turns.iter().enumerate() {
        let (prev_id, prev_at) = out
            .last()
            .map_or((String::new(), None), |d| (d.id.clone(), Some(d.created_at)));
        let capped = t.captured_at.min(latest);
        out.push(Draft {
            id: turn_id(&prev_id, t.role, &t.text),
            role: t.role,
            text: t.text.clone(),
            created_at: prev_at.map_or(capped, |p| capped.max(p)),
            seq: first_seq + i as i64,
        });
    }
}

/// Older turns placed just below the first stored one, dated like it (Gemini shows no
/// dates, and they can't be newer than what follows them).
fn prepend(turns: &[Turn], first: &NormalizedMessage) -> Vec<Draft> {
    let base = i64::from(first.seq) - turns.len() as i64;
    let mut out: Vec<Draft> = Vec::with_capacity(turns.len());
    for (i, t) in turns.iter().enumerate() {
        let prev_id = out.last().map_or(String::new(), |d| d.id.clone());
        out.push(Draft {
            id: turn_id(&prev_id, t.role, &t.text),
            role: t.role,
            text: t.text.clone(),
            created_at: first.created_at,
            seq: base + i as i64,
        });
    }
    out
}

fn finish(mut drafts: Vec<Draft>, branch_changed: bool) -> Merged {
    let mut seen = HashSet::new();
    for d in &mut drafts {
        let mut n = 0u32;
        while !seen.insert(d.id.clone()) {
            n += 1;
            d.id = turn_id(&d.id, d.role, &n.to_string());
        }
    }
    let fits = drafts.iter().all(|d| u32::try_from(d.seq).is_ok());
    if !fits {
        tracing::warn!(turns = drafts.len(), "capture seq space exhausted; renumbering");
        for (i, d) in drafts.iter_mut().enumerate() {
            d.seq = SEQ_BASE + i as i64;
        }
    }
    Merged {
        messages: drafts
            .into_iter()
            .map(|d| NormalizedMessage {
                source_msg_id: d.id,
                role: d.role,
                text: d.text,
                created_at: d.created_at,
                seq: u32::try_from(d.seq).unwrap_or(u32::MAX),
            })
            .collect(),
        branch_changed,
        renumbered: !fits,
    }
}

#[cfg(test)]
#[path = "merge_tests.rs"]
mod tests;
