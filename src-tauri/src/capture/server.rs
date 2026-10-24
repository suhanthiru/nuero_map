//! The HTTP side of capture: `GET /health` and `POST /capture` on 127.0.0.1.
//!
//! Requests come from the extension's service worker, which isn't subject to CORS, so
//! the listener sends no CORS headers at all: a web page can't add the Authorization
//! header without a preflight, and the preflight fails. Every request is checked for the
//! right Host (DNS rebinding) and Origin before anything else, and `/capture` checks the
//! token before its body is read.

use std::sync::Arc;

use axum::body::Bytes;
use axum::extract::{DefaultBodyLimit, Query, Request, State};
use axum::http::{header, HeaderMap, HeaderValue, StatusCode};
use axum::middleware::{self, Next};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::{Deserialize, Serialize};
use serde_json::json;

use super::limits::Limits;
use super::payload::{self, CapturePayload};
use super::store;
use super::token::{health_proof, CaptureToken};
use crate::config::capture::MAX_BODY_BYTES;
use crate::db::Db;
use crate::events::{self, CaptureReceivedEvent, EventSink};

const APP: &str = "neural_map";
const API_VERSION: u32 = 1;
const NONCE_CHARS: (usize, usize) = (16, 64);

/// What the handlers share. Cheap to clone.
#[derive(Clone)]
pub struct ServerState {
    pub db: Db,
    pub sink: Arc<dyn EventSink>,
    pub token: Arc<CaptureToken>,
    /// The port actually bound: the Host check and the health proof use it.
    pub port: u16,
    pub limits: Arc<Limits>,
}

pub fn router(state: ServerState) -> Router {
    let capture = post(capture).layer(middleware::from_fn_with_state(state.clone(), authorize));
    Router::new()
        .route("/health", get(health))
        .route("/capture", capture)
        .layer(DefaultBodyLimit::max(MAX_BODY_BYTES))
        .layer(middleware::from_fn_with_state(state.clone(), guard))
        .with_state(state)
}

fn reject(status: StatusCode, code: &str, message: &str) -> Response {
    let mut response = (status, Json(json!({ "code": code, "message": message }))).into_response();
    no_store(&mut response);
    response
}

fn no_store(response: &mut Response) {
    response
        .headers_mut()
        .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
}

fn header_str<'a>(headers: &'a HeaderMap, name: header::HeaderName) -> Option<&'a str> {
    headers.get(name).and_then(|v| v.to_str().ok())
}

/// Host, Origin and request limits, for every route.
async fn guard(State(state): State<ServerState>, req: Request, next: Next) -> Response {
    let host = header_str(req.headers(), header::HOST);
    let expected = [
        format!("127.0.0.1:{}", state.port),
        format!("localhost:{}", state.port),
    ];
    if !host.is_some_and(|h| expected.iter().any(|e| e == h)) {
        return reject(StatusCode::FORBIDDEN, "bad_host", "unexpected Host header");
    }
    if header_str(req.headers(), header::ORIGIN).is_some_and(|o| !o.starts_with("chrome-extension://")) {
        return reject(StatusCode::FORBIDDEN, "bad_origin", "requests must come from the extension");
    }
    if !state.limits.allow() {
        return reject(StatusCode::TOO_MANY_REQUESTS, "rate_limited", "too many requests");
    }
    let Some(_slot) = state.limits.slot() else {
        return reject(StatusCode::TOO_MANY_REQUESTS, "rate_limited", "too many requests in flight");
    };
    let mut response = next.run(req).await;
    no_store(&mut response);
    response
}

/// Bearer token, content type and declared size, checked before the body is read.
async fn authorize(State(state): State<ServerState>, req: Request, next: Next) -> Response {
    let presented = header_str(req.headers(), header::AUTHORIZATION)
        .and_then(|v| v.strip_prefix("Bearer "))
        .unwrap_or_default();
    if !state.token.verify(presented) {
        return reject(StatusCode::UNAUTHORIZED, "unauthorized", "missing or wrong pairing token");
    }
    let is_json = header_str(req.headers(), header::CONTENT_TYPE)
        .and_then(|v| v.split(';').next())
        .is_some_and(|v| v.trim().eq_ignore_ascii_case("application/json"));
    if !is_json {
        return reject(StatusCode::UNSUPPORTED_MEDIA_TYPE, "unsupported_media_type", "send application/json");
    }
    let declared = header_str(req.headers(), header::CONTENT_LENGTH).and_then(|v| v.parse::<usize>().ok());
    if declared.is_some_and(|n| n > MAX_BODY_BYTES) {
        return reject(StatusCode::PAYLOAD_TOO_LARGE, "too_large", "the capture is too large");
    }
    next.run(req).await
}

#[derive(Deserialize)]
struct HealthQuery {
    nonce: Option<String>,
}

#[derive(Serialize)]
struct Health {
    ok: bool,
    app: &'static str,
    v: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    proof: Option<String>,
}

async fn health(State(state): State<ServerState>, Query(q): Query<HealthQuery>) -> Response {
    let proof = match q.nonce {
        None => None,
        Some(nonce) => {
            let (min, max) = NONCE_CHARS;
            let well_formed = (min..=max).contains(&nonce.len())
                && nonce.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_');
            if !well_formed {
                return reject(StatusCode::BAD_REQUEST, "invalid_input", "nonce must be 16-64 letters, digits, - or _");
            }
            match state.token.get_or_create() {
                Ok(token) => Some(health_proof(&token, &nonce, state.port)),
                Err(e) => {
                    tracing::error!(code = e.code(), "capture token unavailable");
                    return reject(StatusCode::INTERNAL_SERVER_ERROR, "secrets", "the pairing token is unavailable");
                }
            }
        }
    };
    Json(Health { ok: true, app: APP, v: API_VERSION, proof }).into_response()
}

#[derive(Serialize)]
struct Accepted {
    accepted: usize,
    changed: bool,
}

async fn capture(State(state): State<ServerState>, body: Bytes) -> Response {
    let parsed: CapturePayload = match serde_json::from_slice(&body) {
        Ok(p) => p,
        Err(_) => return reject(StatusCode::BAD_REQUEST, "bad_json", "the body is not a v1 capture"),
    };
    let capture = match payload::validate(parsed) {
        Ok(c) => c,
        Err(e) => return reject(StatusCode::BAD_REQUEST, e.code(), &e.to_string()),
    };
    let source_id = capture.source_id.clone();
    if state.limits.flapping(&source_id) {
        return reject(StatusCode::TOO_MANY_REQUESTS, "rate_limited", "this chat changed too often; try again later");
    }
    let stored = match state.db.call(move |c| store::store(c, &capture, chrono::Utc::now())).await {
        Ok(s) => s,
        Err(e) => {
            tracing::error!(code = e.code(), "could not store a capture");
            return reject(StatusCode::INTERNAL_SERVER_ERROR, e.code(), "could not store the capture");
        }
    };
    if stored.branch_changed {
        state.limits.record_branch_change(&source_id);
    }
    if let (true, Some(id)) = (stored.changed, stored.conversation_id) {
        events::emit(
            state.sink.as_ref(),
            events::CAPTURE_RECEIVED,
            &CaptureReceivedEvent {
                conversation_id: id.to_string(),
                new_turns: stored.new_turns as u64,
            },
        );
    }
    Json(Accepted { accepted: stored.new_turns, changed: stored.changed }).into_response()
}
