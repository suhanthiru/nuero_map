//! The normalized shape every source is converted into before it touches the database.

use std::fmt;

use chrono::{DateTime, Utc};
use serde::Serialize;

use crate::config::MAX_DERIVED_TITLE_CHARS;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Source {
    Claude,
    #[serde(rename = "chatgpt")]
    ChatGpt,
    Gemini,
}

impl Source {
    pub fn as_str(self) -> &'static str {
        match self {
            Source::Claude => "claude",
            Source::ChatGpt => "chatgpt",
            Source::Gemini => "gemini",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Role {
    User,
    Assistant,
}

impl Role {
    pub fn as_str(self) -> &'static str {
        match self {
            Role::User => "user",
            Role::Assistant => "assistant",
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct NormalizedMessage {
    pub source_msg_id: String,
    pub role: Role,
    pub text: String,
    pub created_at: DateTime<Utc>,
    /// Position on the conversation's active branch, starting at 0.
    pub seq: u32,
}

#[derive(Debug, Clone, PartialEq)]
pub struct NormalizedConversation {
    pub source: Source,
    pub source_id: String,
    pub title: String,
    pub url: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    /// The source's own "updated" value, verbatim; unchanged marker ⇒ skip on re-import.
    pub updated_marker: String,
    pub messages: Vec<NormalizedMessage>,
}

impl NormalizedConversation {
    pub fn char_count(&self) -> usize {
        self.messages.iter().map(|m| m.text.chars().count()).sum()
    }
}

/// A recoverable problem with one record. Imports continue past these.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct ParseWarning {
    pub conversation: Option<String>,
    pub message: String,
}

impl ParseWarning {
    pub fn new(conversation: Option<&str>, message: impl Into<String>) -> Self {
        Self {
            conversation: conversation.map(str::to_owned),
            message: message.into(),
        }
    }
}

impl fmt::Display for ParseWarning {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match &self.conversation {
            Some(id) => write!(f, "{id}: {}", self.message),
            None => f.write_str(&self.message),
        }
    }
}

/// Outcome of parsing one conversations file.
#[derive(Debug, Default)]
pub struct ParseStats {
    pub elements: usize,
    pub conversations: usize,
    pub warnings: Vec<ParseWarning>,
    /// Parsing was cancelled before the end of the file.
    pub stopped: bool,
}

/// Title from the first user message, truncated to a readable length.
pub fn derive_title(messages: &[NormalizedMessage], fallback: &str) -> String {
    messages
        .iter()
        .find(|m| m.role == Role::User)
        .map(|m| m.text.split_whitespace().collect::<Vec<_>>().join(" "))
        .filter(|t| !t.is_empty())
        .map(|t| t.chars().take(MAX_DERIVED_TITLE_CHARS).collect())
        .unwrap_or_else(|| fallback.to_owned())
}

/// Assign `seq` in order and give messages without a timestamp the previous one's time.
pub fn finalize_messages(
    drafts: Vec<(String, Role, String, Option<DateTime<Utc>>)>,
    conversation_start: DateTime<Utc>,
) -> Vec<NormalizedMessage> {
    let mut last = conversation_start;
    drafts
        .into_iter()
        .enumerate()
        .map(|(i, (id, role, text, at))| {
            let created_at = at.unwrap_or(last);
            last = created_at;
            NormalizedMessage {
                source_msg_id: id,
                role,
                text,
                created_at,
                seq: i as u32,
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn msg(role: Role, text: &str) -> NormalizedMessage {
        NormalizedMessage {
            source_msg_id: "m".into(),
            role,
            text: text.into(),
            created_at: DateTime::UNIX_EPOCH,
            seq: 0,
        }
    }

    #[test]
    fn derives_title_from_first_user_message_collapsing_whitespace() {
        let messages = [
            msg(Role::Assistant, "hi"),
            msg(Role::User, "  plan\n the   thing "),
        ];

        assert_eq!(derive_title(&messages, "Untitled"), "plan the thing");
        assert_eq!(derive_title(&[], "Untitled"), "Untitled");
    }

    #[test]
    fn finalize_fills_missing_times_and_numbers_messages() {
        let t1 = DateTime::from_timestamp(100, 0).unwrap();
        let start = DateTime::from_timestamp(50, 0).unwrap();
        let drafts = vec![
            ("a".into(), Role::User, "x".into(), None),
            ("b".into(), Role::Assistant, "y".into(), Some(t1)),
            ("c".into(), Role::User, "z".into(), None),
        ];

        let out = finalize_messages(drafts, start);

        assert_eq!(
            out.iter()
                .map(|m| (m.seq, m.created_at))
                .collect::<Vec<_>>(),
            [(0, start), (1, t1), (2, t1)]
        );
    }
}
