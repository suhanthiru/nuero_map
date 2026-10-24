//! Claude.ai data export (`conversations.json`).

use std::collections::HashMap;
use std::io::Read;

use chrono::{DateTime, Utc};
use serde::Deserialize;
use serde_json::value::RawValue;

use super::model::{
    derive_title, finalize_messages, NormalizedConversation, ParseStats, ParseWarning, Role, Source,
};
use super::time::parse_rfc3339;
use super::{drive, non_blank, null_default};
use crate::error::AppResult;

#[derive(Deserialize)]
struct RawConversation {
    uuid: String,
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    created_at: Option<String>,
    #[serde(default)]
    updated_at: Option<String>,
    #[serde(default)]
    current_leaf_message_uuid: Option<String>,
    #[serde(default, deserialize_with = "null_default")]
    chat_messages: Vec<RawMessage>,
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct RawMessage {
    uuid: String,
    sender: String,
    text: Option<String>,
    #[serde(deserialize_with = "null_default")]
    content: Vec<RawBlock>,
    created_at: Option<String>,
    parent_message_uuid: Option<String>,
    #[serde(deserialize_with = "null_default")]
    attachments: Vec<RawAttachment>,
}

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum RawBlock {
    Text {
        #[serde(default)]
        text: Option<String>,
    },
    ToolUse {
        #[serde(default)]
        name: Option<String>,
        #[serde(default)]
        input: Option<serde_json::Value>,
    },
    #[serde(other)]
    Other,
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct RawAttachment {
    file_name: Option<String>,
}

#[derive(Deserialize)]
struct IdOnly {
    #[serde(default)]
    uuid: Option<String>,
}

pub fn parse<R: Read>(
    reader: R,
    on_conversation: impl FnMut(NormalizedConversation),
) -> AppResult<ParseStats> {
    drive(reader, normalize, on_conversation, &super::never_stop)
}

/// Like [`parse`], but stops between conversations once `should_stop` returns true.
pub fn parse_until<R: Read>(
    reader: R,
    on_conversation: impl FnMut(NormalizedConversation),
    should_stop: &dyn Fn() -> bool,
) -> AppResult<ParseStats> {
    drive(reader, normalize, on_conversation, should_stop)
}

fn normalize(raw: &RawValue) -> Result<NormalizedConversation, ParseWarning> {
    let conv: RawConversation = serde_json::from_str(raw.get()).map_err(|e| {
        let id = serde_json::from_str::<IdOnly>(raw.get())
            .ok()
            .and_then(|i| i.uuid);
        ParseWarning::new(
            id.as_deref(),
            format!("skipped malformed conversation: {e}"),
        )
    })?;
    let id = conv.uuid.as_str();
    let start = parse_rfc3339(conv.created_at.as_deref());
    let ordered = active_branch(
        &conv.chat_messages,
        conv.current_leaf_message_uuid.as_deref(),
    );
    let drafts = ordered
        .into_iter()
        .filter_map(|m| {
            let role = role_of(&m.sender)?;
            let text = message_text(m)?;
            Some((
                m.uuid.clone(),
                role,
                text,
                parse_rfc3339(m.created_at.as_deref()),
            ))
        })
        .collect::<Vec<_>>();
    if drafts.is_empty() {
        return Err(ParseWarning::new(
            Some(id),
            "skipped conversation with no messages",
        ));
    }
    let first_at = drafts.iter().find_map(|d| d.3);
    let created_at = start.or(first_at).unwrap_or(DateTime::<Utc>::UNIX_EPOCH);
    let messages = finalize_messages(drafts, created_at);
    let title = conv
        .name
        .as_deref()
        .and_then(non_blank)
        .unwrap_or_else(|| derive_title(&messages, "Untitled"));
    Ok(NormalizedConversation {
        source: Source::Claude,
        source_id: conv.uuid.clone(),
        title,
        url: Some(format!("https://claude.ai/chat/{}", conv.uuid)),
        created_at,
        updated_at: parse_rfc3339(conv.updated_at.as_deref()).unwrap_or(created_at),
        updated_marker: conv.updated_at.clone().unwrap_or_default(),
        messages,
    })
}

fn role_of(sender: &str) -> Option<Role> {
    match sender {
        "human" => Some(Role::User),
        "assistant" => Some(Role::Assistant),
        _ => None,
    }
}

/// Walk leaf → root when the export carries branch pointers; otherwise keep array order.
fn active_branch<'a>(messages: &'a [RawMessage], leaf: Option<&str>) -> Vec<&'a RawMessage> {
    let by_id: HashMap<&str, &RawMessage> = messages.iter().map(|m| (m.uuid.as_str(), m)).collect();
    let has_parents = messages.iter().any(|m| m.parent_message_uuid.is_some());
    let Some(mut current) = leaf.filter(|l| has_parents && by_id.contains_key(l)) else {
        return messages.iter().collect();
    };
    let mut path = Vec::new();
    let mut seen = std::collections::HashSet::new();
    while let Some(m) = by_id.get(current).filter(|_| seen.insert(current)) {
        path.push(*m);
        match m.parent_message_uuid.as_deref() {
            Some(parent) => current = parent,
            None => break,
        }
    }
    path.reverse();
    path
}

/// Text blocks, else the flattened `text`, else an artifact marker; plus attachment markers.
fn message_text(m: &RawMessage) -> Option<String> {
    let from_blocks = m
        .content
        .iter()
        .filter_map(|b| match b {
            RawBlock::Text { text } => text.as_deref().and_then(non_blank),
            _ => None,
        })
        .collect::<Vec<_>>()
        .join("\n\n");
    let body = non_blank(&from_blocks)
        .or_else(|| m.text.as_deref().and_then(non_blank))
        .or_else(|| artifact_marker(&m.content));
    let attachments = m
        .attachments
        .iter()
        .filter_map(|a| a.file_name.as_deref())
        .map(|name| format!("[attachment: {name}]"));
    let parts: Vec<String> = body.into_iter().chain(attachments).collect();
    (!parts.is_empty()).then(|| parts.join("\n\n"))
}

fn artifact_marker(blocks: &[RawBlock]) -> Option<String> {
    blocks.iter().find_map(|b| match b {
        RawBlock::ToolUse {
            name: Some(name),
            input,
        } if name == "artifacts" => {
            let title = input
                .as_ref()
                .and_then(|i| i.get("title"))
                .and_then(|t| t.as_str())
                .unwrap_or("untitled");
            Some(format!("[artifact: {title}]"))
        }
        _ => None,
    })
}
