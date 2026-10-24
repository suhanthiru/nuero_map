//! Figures out whether an archive is a Claude or ChatGPT export and which files hold
//! the conversations (ChatGPT v2 exports shard them as conversations-000.json, …).

use std::io::Read;

use serde::{Deserialize, Serialize};

use super::archive::Archive;
use crate::config::SNIFF_BYTES;
use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RequestedSource {
    Auto,
    Claude,
    #[serde(rename = "chatgpt")]
    ChatGpt,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ExportKind {
    Claude,
    ChatGpt,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Detected {
    pub kind: ExportKind,
    pub conversation_files: Vec<String>,
}

const CHATGPT_MARKERS: &[&str] = &[
    "chat.html",
    "message_feedback.json",
    "export_manifest.json",
    "shared_conversations.json",
    "model_comparisons.json",
    "user.json",
];
const CLAUDE_MARKERS: &[&str] = &["users.json", "projects.json"];
const CLAUDE_DIRS: &[&str] = &["projects/", "design_chats/"];

fn base_name(path: &str) -> &str {
    path.rsplit('/').next().unwrap_or(path)
}

fn depth(path: &str) -> usize {
    path.matches('/').count()
}

fn is_shard(name: &str) -> bool {
    let base = base_name(name);
    base.strip_prefix("conversations-")
        .and_then(|rest| rest.strip_suffix(".json"))
        .is_some_and(|n| !n.is_empty() && n.chars().all(|c| c.is_ascii_digit()))
}

/// Shards if present (sorted), otherwise the shallowest conversations.json.
fn conversation_files(names: &[String]) -> Vec<String> {
    let mut shards: Vec<String> = names.iter().filter(|n| is_shard(n)).cloned().collect();
    if !shards.is_empty() {
        shards.sort();
        return shards;
    }
    names
        .iter()
        .filter(|n| base_name(n) == "conversations.json")
        .min_by_key(|n| depth(n))
        .cloned()
        .into_iter()
        .collect()
}

fn kind_from_markers(names: &[String]) -> Option<ExportKind> {
    let has = |markers: &[&str]| names.iter().any(|n| markers.contains(&base_name(n)));
    let has_claude_dir = names.iter().any(|n| {
        CLAUDE_DIRS
            .iter()
            .any(|d| n.starts_with(d) || n.contains(&format!("/{d}")))
    });
    if has(CHATGPT_MARKERS) || names.iter().any(|n| is_shard(n)) {
        Some(ExportKind::ChatGpt)
    } else if has(CLAUDE_MARKERS) || has_claude_dir {
        Some(ExportKind::Claude)
    } else {
        None
    }
}

fn sniff(archive: &Archive, file: &str) -> AppResult<ExportKind> {
    let head = archive.read_entry(file, |r| {
        let mut buf = Vec::with_capacity(SNIFF_BYTES);
        r.take(SNIFF_BYTES as u64).read_to_end(&mut buf)?;
        Ok(String::from_utf8_lossy(&buf).into_owned())
    })?;
    let claude_at = head.find("\"chat_messages\"");
    let chatgpt_at = head.find("\"mapping\"");
    match (claude_at, chatgpt_at) {
        (Some(a), Some(b)) if a < b => Ok(ExportKind::Claude),
        (Some(_), None) => Ok(ExportKind::Claude),
        (_, Some(_)) => Ok(ExportKind::ChatGpt),
        (None, None) => Err(AppError::BadExport(format!(
            "{file} does not look like a Claude or ChatGPT export"
        ))),
    }
}

fn check_requested(kind: ExportKind, requested: RequestedSource) -> AppResult<()> {
    let ok = matches!(
        (requested, kind),
        (RequestedSource::Auto, _)
            | (RequestedSource::Claude, ExportKind::Claude)
            | (RequestedSource::ChatGpt, ExportKind::ChatGpt)
    );
    if ok {
        Ok(())
    } else {
        Err(AppError::BadExport(format!(
            "this looks like a {kind:?} export, not {requested:?}"
        )))
    }
}

pub fn detect(archive: &Archive, requested: RequestedSource) -> AppResult<Detected> {
    let names = archive.file_names()?;
    let files = conversation_files(&names);
    let first = files
        .first()
        .ok_or_else(|| AppError::BadExport("no conversations.json found".into()))?;
    let kind = match kind_from_markers(&names) {
        Some(kind) => kind,
        None => sniff(archive, first)?,
    };
    check_requested(kind, requested)?;
    Ok(Detected {
        kind,
        conversation_files: files,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recognizes_numbered_shards_only() {
        assert!(is_shard("x/conversations-000.json"));
        assert!(!is_shard("conversations-.json"));
        assert!(!is_shard("conversations-abc.json"));
        assert!(!is_shard("conversations.json"));
    }

    #[test]
    fn claude_project_folders_count_as_markers() {
        let names = vec![
            "conversations.json".to_string(),
            "projects/p1.json".to_string(),
        ];

        assert_eq!(kind_from_markers(&names), Some(ExportKind::Claude));
    }
}
