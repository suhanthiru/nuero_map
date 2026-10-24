use serde::Serialize;
use tauri::State;

use super::{blocking, parse_id};
use crate::app_state::AppState;
use crate::config::DEFAULT_SOURCE_CONTEXT_TURNS;
use crate::db::repo::{conversations, messages};
use crate::db::Db;
use crate::error::{AppError, AppResult};

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SourceMessageDto {
    pub id: String,
    pub speaker: String,
    pub text: String,
    pub timestamp: String,
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SourceContextDto {
    pub app: String,
    pub conversation_id: String,
    pub conversation_title: String,
    pub conversation_url: Option<String>,
    pub focus_message_id: String,
    pub messages: Vec<SourceMessageDto>,
}

pub fn load_source_context(db: &Db, message_id: i64, turns: u32) -> AppResult<SourceContextDto> {
    db.call_blocking(|conn| {
        let (conversation_id, rows) = messages::with_context(conn, message_id, turns)?
            .ok_or_else(|| AppError::NotFound(format!("message {message_id}")))?;
        let header = conversations::header(conn, conversation_id)?
            .ok_or_else(|| AppError::NotFound(format!("conversation {conversation_id}")))?;
        Ok(SourceContextDto {
            app: header.source,
            conversation_id: header.id.to_string(),
            conversation_title: header.title,
            conversation_url: header.url,
            focus_message_id: message_id.to_string(),
            messages: rows
                .into_iter()
                .map(|m| SourceMessageDto {
                    id: m.id.to_string(),
                    speaker: m.role,
                    text: m.text,
                    timestamp: m.created_at,
                })
                .collect(),
        })
    })
}

#[tauri::command]
pub async fn get_source_context(
    state: State<'_, AppState>,
    message_id: String,
    turns: Option<u32>,
) -> Result<SourceContextDto, AppError> {
    let id = parse_id("message", &message_id)?;
    let db = state.db.clone();
    blocking(move || load_source_context(&db, id, turns.unwrap_or(DEFAULT_SOURCE_CONTEXT_TURNS)))
        .await
}
