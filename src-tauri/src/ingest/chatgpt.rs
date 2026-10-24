//! ChatGPT data export (`conversations.json` or `conversations-NNN.json` shards).
//! Each conversation is a tree; we keep the branch the user last saw.

use std::collections::{HashMap, HashSet};
use std::io::Read;

use chrono::{DateTime, Utc};
use serde::Deserialize;
use serde_json::value::RawValue;
use serde_json::Value;

use super::model::{
    derive_title, finalize_messages, NormalizedConversation, ParseStats, ParseWarning, Role, Source,
};
use super::time::from_unix_float;
use super::{drive, non_blank, null_default};
use crate::error::AppResult;

#[derive(Deserialize)]
struct RawConversation {
    #[serde(default)]
    id: Option<String>,
    #[serde(default)]
    conversation_id: Option<String>,
    #[serde(default)]
    title: Option<String>,
    #[serde(default)]
    create_time: Option<f64>,
    #[serde(default)]
    update_time: Option<Value>,
    #[serde(default)]
    current_node: Option<String>,
    #[serde(default, deserialize_with = "null_default")]
    mapping: HashMap<String, RawNode>,
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct RawNode {
    message: Option<RawMessage>,
    parent: Option<String>,
    #[serde(deserialize_with = "null_default")]
    children: Vec<String>,
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct RawMessage {
    id: String,
    author: RawAuthor,
    create_time: Option<f64>,
    content: Option<RawContent>,
    metadata: Option<Value>,
    recipient: Option<String>,
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct RawAuthor {
    role: String,
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct RawContent {
    content_type: String,
    parts: Option<Vec<Value>>,
}

#[derive(Deserialize)]
struct IdOnly {
    #[serde(default)]
    id: Option<String>,
    #[serde(default)]
    conversation_id: Option<String>,
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
            .and_then(|i| i.id.or(i.conversation_id));
        ParseWarning::new(
            id.as_deref(),
            format!("skipped malformed conversation: {e}"),
        )
    })?;
    let id = conv
        .id
        .clone()
        .or(conv.conversation_id.clone())
        .ok_or_else(|| ParseWarning::new(None, "skipped conversation without an id"))?;
    let drafts = active_path(&conv.mapping, conv.current_node.as_deref())
        .into_iter()
        .filter_map(|m| {
            let role = visible_role(m)?;
            let text = content_text(m.content.as_ref()?)?;
            Some((m.id.clone(), role, text, from_unix_float(m.create_time)))
        })
        .collect::<Vec<_>>();
    if drafts.is_empty() {
        return Err(ParseWarning::new(
            Some(&id),
            "skipped conversation with no messages",
        ));
    }
    let first_at = drafts.iter().find_map(|d| d.3);
    let created_at = from_unix_float(conv.create_time)
        .or(first_at)
        .unwrap_or(DateTime::<Utc>::UNIX_EPOCH);
    let messages = finalize_messages(drafts, created_at);
    let updated_at = conv
        .update_time
        .as_ref()
        .and_then(Value::as_f64)
        .and_then(|t| from_unix_float(Some(t)))
        .unwrap_or(created_at);
    let title = conv
        .title
        .as_deref()
        .and_then(non_blank)
        .unwrap_or_else(|| derive_title(&messages, "New chat"));
    Ok(NormalizedConversation {
        source: Source::ChatGpt,
        url: Some(format!("https://chatgpt.com/c/{id}")),
        source_id: id,
        title,
        created_at,
        updated_at,
        updated_marker: marker(conv.update_time.as_ref()),
        messages,
    })
}

/// The source's update value verbatim, so float formatting never causes false changes.
fn marker(value: Option<&Value>) -> String {
    match value {
        None | Some(Value::Null) => String::new(),
        Some(Value::String(s)) => s.clone(),
        Some(other) => other.to_string(),
    }
}

/// Messages on the active branch, root first. Guards against parent cycles.
fn active_path<'a>(
    mapping: &'a HashMap<String, RawNode>,
    current: Option<&str>,
) -> Vec<&'a RawMessage> {
    let nodes: Vec<&RawNode> = match current.filter(|c| mapping.contains_key(*c)) {
        Some(leaf) => walk_up(mapping, leaf),
        None => walk_down_newest(mapping),
    };
    nodes
        .into_iter()
        .filter_map(|n| n.message.as_ref())
        .collect()
}

fn walk_up<'a>(mapping: &'a HashMap<String, RawNode>, leaf: &str) -> Vec<&'a RawNode> {
    let mut path = Vec::new();
    let mut seen = HashSet::new();
    let mut cursor = Some(leaf);
    while let Some(id) = cursor.filter(|id| seen.insert(id.to_owned())) {
        let Some(node) = mapping.get(id) else { break };
        path.push(node);
        cursor = node.parent.as_deref();
    }
    path.reverse();
    path
}

/// Without a usable current_node: from the root, follow the most recent child each step.
fn walk_down_newest(mapping: &HashMap<String, RawNode>) -> Vec<&RawNode> {
    let mut roots: Vec<&String> = mapping
        .iter()
        .filter(|(_, n)| n.parent.as_ref().is_none_or(|p| !mapping.contains_key(p)))
        .map(|(id, _)| id)
        .collect();
    roots.sort();
    let mut path = Vec::new();
    let mut seen = HashSet::new();
    let mut cursor = roots.first().map(|s| s.as_str());
    while let Some(id) = cursor.filter(|id| seen.insert(id.to_owned())) {
        let Some(node) = mapping.get(id) else { break };
        path.push(node);
        cursor = newest_child(mapping, node);
    }
    path
}

fn newest_child<'a>(mapping: &HashMap<String, RawNode>, node: &'a RawNode) -> Option<&'a str> {
    let time = |id: &String| {
        mapping
            .get(id)
            .and_then(|n| n.message.as_ref())
            .and_then(|m| m.create_time)
            .unwrap_or(f64::NEG_INFINITY)
    };
    // max_by keeps the last of equal elements, so ties go to the last child.
    node.children
        .iter()
        .max_by(|a, b| time(a).total_cmp(&time(b)))
        .map(String::as_str)
}

/// User/assistant messages meant for the conversation (not hidden, not tool calls).
fn visible_role(m: &RawMessage) -> Option<Role> {
    let hidden = m
        .metadata
        .as_ref()
        .and_then(|md| md.get("is_visually_hidden_from_conversation"))
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let to_tool = m.recipient.as_deref().is_some_and(|r| r != "all");
    if hidden || to_tool {
        return None;
    }
    match m.author.role.as_str() {
        "user" => Some(Role::User),
        "assistant" => Some(Role::Assistant),
        _ => None,
    }
}

fn content_text(content: &RawContent) -> Option<String> {
    let parts = content.parts.as_deref().unwrap_or_default();
    let pieces: Vec<String> = match content.content_type.as_str() {
        "text" => parts
            .iter()
            .filter_map(Value::as_str)
            .filter_map(non_blank)
            .collect(),
        "multimodal_text" => parts.iter().filter_map(multimodal_part).collect(),
        _ => return None,
    };
    non_blank(&pieces.join("\n"))
}

fn multimodal_part(part: &Value) -> Option<String> {
    if let Some(text) = part.as_str() {
        return non_blank(text);
    }
    match part.get("content_type").and_then(Value::as_str)? {
        "image_asset_pointer" => Some("[image]".to_owned()),
        "audio_transcription" => part.get("text").and_then(Value::as_str).and_then(non_blank),
        _ => None,
    }
}
