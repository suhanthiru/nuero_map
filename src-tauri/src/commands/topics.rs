use chrono::Utc;
use serde::Deserialize;
use tauri::State;

use super::{blocking, parse_id};
use crate::app_state::AppState;
use crate::config::topics::OPENED_WEIGHT;
use crate::db::repo::topics as repo;
use crate::error::AppError;
use crate::graph::shelf::{self, ShelfDto};
use crate::graph::view::{self, EdgeEvidenceDto, GraphDto};
use crate::settings;
use crate::topics::dto::{topic_summary, TopicSummaryDto};
use crate::topics::mentions::{self, UnlinkedMentionDto};
use crate::topics::note::{self, TopicNoteDto};
use crate::topics::page::{self, GemDto, TopicFilter, TopicPageDto};
use crate::topics::search::{self, SearchHit};

const STATES: &[&str] = &["active", "parked", "done", "dead"];

fn not_found(kind: &str, id: i64) -> AppError {
    AppError::NotFound(format!("{kind} {id}"))
}

#[tauri::command]
pub async fn list_topics(
    state: State<'_, AppState>,
    filter: TopicFilter,
) -> Result<Vec<TopicSummaryDto>, AppError> {
    let db = state.db.clone();
    blocking(move || db.call_blocking(|c| page::list_topics(c, &filter))).await
}

#[tauri::command]
pub async fn get_topic_page(
    state: State<'_, AppState>,
    id: String,
) -> Result<TopicPageDto, AppError> {
    let id = parse_id("topic", &id)?;
    let db = state.db.clone();
    blocking(move || db.call_blocking(|c| page::topic_page(c, id))).await
}

#[tauri::command]
pub async fn record_topic_opened(state: State<'_, AppState>, id: String) -> Result<(), AppError> {
    let id = parse_id("topic", &id)?;
    let db = state.db.clone();
    blocking(move || db.call_blocking(|c| repo::record_opened(c, id, OPENED_WEIGHT))).await
}

/// Managed state is injected by type, so it's named `app` here to free `state` for the
/// topic state argument the frontend sends.
#[tauri::command]
pub async fn set_topic_state(
    app: State<'_, AppState>,
    id: String,
    state: String,
    check_in_at: Option<String>,
) -> Result<TopicSummaryDto, AppError> {
    let id = parse_id("topic", &id)?;
    if !STATES.contains(&state.as_str()) {
        return Err(AppError::InvalidInput(format!("unknown state {state}")));
    }
    let db = app.db.clone();
    blocking(move || {
        db.call_blocking(|c| {
            if !repo::set_state(c, id, &state, check_in_at.as_deref())? {
                return Err(not_found("topic", id));
            }
            topic_summary(c, id)?.ok_or_else(|| not_found("topic", id))
        })
    })
    .await
}

#[tauri::command]
pub async fn rename_topic(
    state: State<'_, AppState>,
    id: String,
    title: String,
) -> Result<TopicSummaryDto, AppError> {
    let id = parse_id("topic", &id)?;
    if title.trim().is_empty() {
        return Err(AppError::InvalidInput("a topic needs a name".into()));
    }
    let db = state.db.clone();
    blocking(move || {
        db.call_blocking(|c| {
            if !repo::rename(c, id, &title)? {
                return Err(not_found("topic", id));
            }
            topic_summary(c, id)?.ok_or_else(|| not_found("topic", id))
        })
    })
    .await
}

#[tauri::command]
pub async fn get_topic_note(
    state: State<'_, AppState>,
    topic_id: String,
) -> Result<TopicNoteDto, AppError> {
    let id = parse_id("topic", &topic_id)?;
    let db = state.db.clone();
    blocking(move || db.call_blocking(|c| note::get_note(c, id))).await
}

#[tauri::command]
pub async fn save_topic_note(
    state: State<'_, AppState>,
    topic_id: String,
    body: String,
) -> Result<TopicNoteDto, AppError> {
    let id = parse_id("topic", &topic_id)?;
    let db = state.db.clone();
    blocking(move || db.call_blocking(|c| note::save_note(c, id, &body))).await
}

#[tauri::command]
pub async fn get_unlinked_mentions(
    state: State<'_, AppState>,
    topic_id: String,
) -> Result<Vec<UnlinkedMentionDto>, AppError> {
    let id = parse_id("topic", &topic_id)?;
    let db = state.db.clone();
    blocking(move || db.call_blocking(|c| mentions::unlinked_mentions(c, id))).await
}

#[tauri::command]
pub async fn pin_gem(
    state: State<'_, AppState>,
    topic_id: String,
    idea_id: String,
) -> Result<GemDto, AppError> {
    let topic = parse_id("topic", &topic_id)?;
    let idea = parse_id("idea", &idea_id)?;
    let db = state.db.clone();
    blocking(move || db.call_blocking(|c| page::pin_gem(c, topic, idea))).await
}

#[tauri::command]
pub async fn unpin_gem(state: State<'_, AppState>, gem_id: String) -> Result<(), AppError> {
    let id = parse_id("gem", &gem_id)?;
    let db = state.db.clone();
    blocking(move || {
        db.call_blocking(|c| {
            Ok(c.execute("delete from gems where id = ?1", [id])
                .map(|_| ())?)
        })
    })
    .await
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphOptions {
    pub include_dead: Option<bool>,
    pub include_semantic: Option<bool>,
}

#[tauri::command]
pub async fn get_graph(
    state: State<'_, AppState>,
    opts: GraphOptions,
) -> Result<GraphDto, AppError> {
    let db = state.db.clone();
    let (dead, semantic) = (
        opts.include_dead.unwrap_or(false),
        opts.include_semantic.unwrap_or(false),
    );
    blocking(move || db.call_blocking(|c| view::graph(c, dead, semantic))).await
}

#[tauri::command]
pub async fn get_edge_evidence(
    state: State<'_, AppState>,
    edge_id: String,
) -> Result<EdgeEvidenceDto, AppError> {
    let db = state.db.clone();
    blocking(move || db.call_blocking(|c| view::edge_evidence_by_id(c, &edge_id))).await
}

#[tauri::command]
pub async fn get_today_shelf(state: State<'_, AppState>) -> Result<ShelfDto, AppError> {
    let db = state.db.clone();
    blocking(move || {
        db.call_blocking(|c| {
            let half_life = settings::half_life_days(c)?;
            shelf::today(c, Utc::now(), half_life)
        })
    })
    .await
}

#[tauri::command]
pub async fn search(
    state: State<'_, AppState>,
    query: String,
    limit: Option<i64>,
) -> Result<Vec<SearchHit>, AppError> {
    let db = state.db.clone();
    blocking(move || db.call_blocking(|c| search::search(c, &query, limit.unwrap_or(10)))).await
}

/// Topic syntheses arrive in Phase 6.
#[tauri::command]
pub async fn regenerate_synthesis(topic_id: String) -> Result<String, AppError> {
    let _ = topic_id;
    Err(AppError::NotAvailable(
        "topic summaries arrive in the next update".into(),
    ))
}

/// Merge suggestions arrive in Phase 8.
#[tauri::command]
pub async fn list_merge_suggestions() -> Result<Vec<serde_json::Value>, AppError> {
    Ok(Vec::new())
}
