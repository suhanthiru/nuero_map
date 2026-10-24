//! Unlinked mentions (`UnlinkedMention` in `src/api/contract/notes.ts`): other topics'
//! notes and ideas that name a topic, as whole words, without linking it.

use std::collections::HashMap;

use rusqlite::{params, Connection};
use serde::Serialize;

use super::dto::{idea_excerpt, topic_summary, ExcerptDto, TopicSummaryDto};
use super::links;
use super::wikilinks;
use crate::config::topics::{MENTION_MIN_CHARS, UNLINKED_MENTIONS_LIMIT};
use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UnlinkedMentionDto {
    /// The topic whose note or idea mentions this one.
    pub topic: TopicSummaryDto,
    /// "note" or "idea".
    pub source: &'static str,
    pub text: String,
    /// The matched span in `text`, in UTF-16 code units (JavaScript string offsets).
    pub start: usize,
    pub end: usize,
    pub line: Option<i64>,
    pub excerpt: Option<ExcerptDto>,
}

/// A name to look for, lowercased char by char (so offsets stay on the original text).
#[derive(Debug, Clone, PartialEq)]
pub struct Needle {
    chars: Vec<char>,
    word_start: bool,
    word_end: bool,
}

impl Needle {
    pub fn new(name: &str) -> Option<Self> {
        let trimmed = name.trim();
        let chars: Vec<char> = trimmed.chars().flat_map(char::to_lowercase).collect();
        if trimmed.chars().count() < MENTION_MIN_CHARS {
            return None;
        }
        Some(Needle {
            word_start: chars.first().is_some_and(|c| c.is_alphanumeric()),
            word_end: chars.last().is_some_and(|c| c.is_alphanumeric()),
            chars,
        })
    }

    /// A piece of the lowercased name that SQLite's ASCII-only `lower()` finds in any casing
    /// of a true match: its longest run of ASCII or caseless characters. None when the name
    /// has no such run (it's all letters like "é" whose case SQLite can't fold).
    fn prefilter_key(&self) -> Option<String> {
        let foldable = |c: &char| c.is_ascii() || !(c.is_lowercase() || c.is_uppercase());
        let mut best: &[char] = &[];
        for run in self.chars.split(|c| !foldable(c)) {
            if run.len() > best.len() {
                best = run;
            }
        }
        (!best.is_empty()).then(|| best.iter().collect())
    }

    /// Byte end of a case-insensitive match starting at char `i`, if there is one. The match
    /// must end on a char boundary of the original text (all of a char's lowercase form).
    fn match_at(&self, hay: &[(usize, char)], i: usize, len: usize) -> Option<usize> {
        let mut want = self.chars.iter();
        let mut next = want.next();
        for (k, &(_, c)) in hay.iter().enumerate().skip(i) {
            for lc in c.to_lowercase() {
                if next != Some(&lc) {
                    return None;
                }
                next = want.next();
            }
            if next.is_none() {
                return Some(hay.get(k + 1).map_or(len, |&(b, _)| b));
            }
        }
        None
    }
}

fn alnum_before(hay: &[(usize, char)], i: usize) -> bool {
    i > 0 && hay[i - 1].1.is_alphanumeric()
}

fn alnum_at(text: &str, byte: usize) -> bool {
    text[byte..]
        .chars()
        .next()
        .is_some_and(char::is_alphanumeric)
}

/// The earliest whole-word match of any needle in `text` that doesn't touch a protected
/// byte range: (start, end) in bytes. Ties go to the longer match.
pub fn find_mention(
    text: &str,
    needles: &[Needle],
    protected: &[(usize, usize)],
) -> Option<(usize, usize)> {
    let hay: Vec<(usize, char)> = text.char_indices().collect();
    for i in 0..hay.len() {
        let start = hay[i].0;
        let best = needles
            .iter()
            .filter(|n| !(n.word_start && alnum_before(&hay, i)))
            .filter_map(|n| {
                let end = n.match_at(&hay, i, text.len())?;
                (!(n.word_end && alnum_at(text, end))).then_some(end)
            })
            .filter(|&end| !protected.iter().any(|&(a, b)| start < b && a < end))
            .max();
        if let Some(end) = best {
            return Some((start, end));
        }
    }
    None
}

/// Byte ranges a mention must not fall in because they're links already: markdown links
/// and images `[text](url)` (text and URL both), autolinks `<https://…>`, bare URLs.
pub fn link_spans(text: &str) -> Vec<(usize, usize)> {
    let b = text.as_bytes();
    let mut out = Vec::new();
    let mut i = 0;
    while i < b.len() {
        let rest = &text[i..];
        let end = match b[i] {
            b'[' => markdown_link_end(rest),
            b'<' => autolink_end(rest),
            _ if rest.starts_with("http://") || rest.starts_with("https://") => {
                Some(rest.find(char::is_whitespace).unwrap_or(rest.len()))
            }
            _ => None,
        };
        if let Some(len) = end {
            // An image's `!` belongs to it too.
            let from = if b[i] == b'[' && i > 0 && b[i - 1] == b'!' {
                i - 1
            } else {
                i
            };
            out.push((from, i + len));
            i += len;
            continue;
        }
        i += rest.chars().next().map_or(1, char::len_utf8);
    }
    out
}

/// Length of `[text](url)` at the start of `s`, if it is one.
fn markdown_link_end(s: &str) -> Option<usize> {
    let close = s.find(']')?;
    let after = &s[close + 1..];
    let url = after.strip_prefix('(')?;
    Some(close + 2 + url.find(')')? + 1)
}

/// Length of `<scheme:…>` at the start of `s`, if it is an autolink.
fn autolink_end(s: &str) -> Option<usize> {
    let inner = &s[1..];
    let scheme = ["http://", "https://", "mailto:"]
        .iter()
        .any(|p| inner.starts_with(p));
    let close = inner.find('>')?;
    (scheme && !inner[..close].contains(char::is_whitespace)).then_some(close + 2)
}

fn utf16(text: &str, byte: usize) -> usize {
    text[..byte].encode_utf16().count()
}

/// The topic's title and aliases, without repeats, as needles.
fn needles_for(topic: &TopicSummaryDto) -> Vec<Needle> {
    let mut out: Vec<Needle> = Vec::new();
    for name in std::iter::once(&topic.title).chain(&topic.aliases) {
        if let Some(n) = Needle::new(name) {
            if !out.contains(&n) {
                out.push(n);
            }
        }
    }
    out
}

struct Summaries<'c> {
    conn: &'c Connection,
    cache: HashMap<i64, Option<TopicSummaryDto>>,
}

impl Summaries<'_> {
    fn get(&mut self, id: i64) -> AppResult<Option<TopicSummaryDto>> {
        if let Some(hit) = self.cache.get(&id) {
            return Ok(hit.clone());
        }
        let topic = topic_summary(self.conn, id)?;
        self.cache.insert(id, topic.clone());
        Ok(topic)
    }
}

fn note_mentions(
    conn: &Connection,
    topic_id: i64,
    needles: &[Needle],
    topics: &mut Summaries,
) -> AppResult<Vec<UnlinkedMentionDto>> {
    let mut stmt = conn.prepare(
        "select n.topic_id, n.body from topic_notes n join topics t on t.id = n.topic_id
          where t.merged_into is null and n.topic_id != ?1
          order by n.updated_at desc, n.topic_id",
    )?;
    let notes: Vec<(i64, String)> = stmt
        .query_map([topic_id], |r| Ok((r.get(0)?, r.get(1)?)))?
        .collect::<Result<_, _>>()?;
    let mut out = Vec::new();
    for (source, body) in notes {
        for line in wikilinks::scan(&body) {
            if out.len() >= UNLINKED_MENTIONS_LIMIT {
                return Ok(out);
            }
            if line.in_code {
                continue;
            }
            // Verbatim (a CRLF note keeps its `\r`), so the frontend can check it before linking.
            let text = line.text;
            let protected: Vec<(usize, usize)> = line
                .protected
                .iter()
                .copied()
                .chain(link_spans(text))
                .collect();
            let Some((start, end)) = find_mention(text, needles, &protected) else {
                continue;
            };
            let Some(topic) = topics.get(source)? else {
                break;
            };
            out.push(UnlinkedMentionDto {
                topic,
                source: "note",
                text: text.to_string(),
                start: utf16(text, start),
                end: utf16(text, end),
                line: Some(line.line),
                excerpt: None,
            });
        }
    }
    Ok(out)
}

fn idea_mentions(
    conn: &Connection,
    topic_id: i64,
    needles: &[Needle],
    topics: &mut Summaries,
) -> AppResult<Vec<UnlinkedMentionDto>> {
    let connected = links::connected(conn, topic_id)?;
    // A cheap SQL pass skips ideas that can't match; the Rust check below is the real test.
    // A name with nothing SQLite can case-fold turns the pass off rather than drop matches.
    let keys: Option<Vec<String>> = needles.iter().map(Needle::prefilter_key).collect();
    let mut stmt = conn.prepare(
        "select i.id, i.topic_id, i.title, i.summary, i.excerpt from ideas i
           join topics t on t.id = i.topic_id
          where t.merged_into is null and i.topic_id != ?1 and i.duplicate_of_idea_id is null
            and (?3 or exists (select 1 from json_each(?2) n
                         where instr(lower(i.excerpt), n.value) or instr(lower(i.title), n.value)
                            or instr(lower(i.summary), n.value)))
          order by i.first_message_at desc, i.id desc",
    )?;
    let candidates: Vec<(i64, i64, String, String, String)> = stmt
        .query_map(
            params![
                topic_id,
                serde_json::to_string(keys.as_deref().unwrap_or_default())?,
                keys.is_none()
            ],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?)),
        )?
        .collect::<Result<_, _>>()?;
    let mut out = Vec::new();
    for (idea, source, title, summary, excerpt_text) in candidates {
        if out.len() >= UNLINKED_MENTIONS_LIMIT {
            break;
        }
        if connected.contains(&source) {
            continue;
        }
        let Some((text, (start, end))) = [excerpt_text, title, summary]
            .into_iter()
            .find_map(|t| find_mention(&t, needles, &link_spans(&t)).map(|m| (t, m)))
        else {
            continue;
        };
        let (Some(excerpt), Some(topic)) = (idea_excerpt(conn, idea)?, topics.get(source)?) else {
            continue;
        };
        out.push(UnlinkedMentionDto {
            topic,
            source: "idea",
            start: utf16(&text, start),
            end: utf16(&text, end),
            text,
            line: None,
            excerpt: Some(excerpt),
        });
    }
    Ok(out)
}

/// Note mentions first (newest note first, then by line), then idea mentions (newest first)
/// from topics not yet connected to this one. At most `UNLINKED_MENTIONS_LIMIT` of each.
pub fn unlinked_mentions(conn: &Connection, topic_id: i64) -> AppResult<Vec<UnlinkedMentionDto>> {
    let topic = topic_summary(conn, topic_id)?
        .ok_or_else(|| AppError::NotFound(format!("topic {topic_id}")))?;
    let needles = needles_for(&topic);
    if needles.is_empty() {
        return Ok(Vec::new());
    }
    let mut topics = Summaries {
        conn,
        cache: HashMap::new(),
    };
    let mut out = note_mentions(conn, topic_id, &needles, &mut topics)?;
    out.extend(idea_mentions(conn, topic_id, &needles, &mut topics)?);
    Ok(out)
}

#[cfg(test)]
#[path = "mentions_tests.rs"]
mod tests;
