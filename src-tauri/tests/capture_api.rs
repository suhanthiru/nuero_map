use std::sync::Arc;

use axum::body::Body;
use axum::http::{Request, StatusCode};
use neural_map_lib::capture::limits::Limits;
use neural_map_lib::capture::server::{router, ServerState};
use neural_map_lib::capture::token::{health_proof, CaptureToken};
use neural_map_lib::config::capture::{BRANCH_CHANGE_LIMIT, MAX_BODY_BYTES};
use neural_map_lib::db::Db;
use neural_map_lib::events::{RecordingSink, CAPTURE_RECEIVED};
use neural_map_lib::secrets::MemoryStore;
use serde_json::{json, Value};
use tower::ServiceExt;

const PORT: u16 = 47831;
const HOST: &str = "127.0.0.1:47831";

struct Api {
    db: Db,
    sink: Arc<RecordingSink>,
    state: ServerState,
    token: String,
}

fn api() -> Api {
    let db = Db::open_in_memory().unwrap();
    let sink = Arc::new(RecordingSink::default());
    let token = Arc::new(CaptureToken::new(Arc::new(MemoryStore::default())));
    let secret = token.get_or_create().unwrap();
    let state = ServerState {
        db: db.clone(),
        sink: sink.clone(),
        token,
        port: PORT,
        limits: Arc::new(Limits::default()),
    };
    Api { db, sink, state, token: secret }
}

fn body(texts: &[&str]) -> String {
    let turns: Vec<Value> = texts
        .iter()
        .enumerate()
        .map(|(i, t)| {
            json!({
                "role": if i % 2 == 0 { "user" } else { "model" },
                "text": t,
                "captured_at": "2026-10-22T10:00:00Z"
            })
        })
        .collect();
    json!({
        "v": 1, "source": "gemini",
        "conversation": {"source_id": "c1", "title": "Chat"},
        "turns": turns, "client": {"ext_version": "0.1.0"}
    })
    .to_string()
}

fn post(api: &Api) -> axum::http::request::Builder {
    Request::post("/capture")
        .header("host", HOST)
        .header("authorization", format!("Bearer {}", api.token))
        .header("content-type", "application/json")
}

async fn send(api: &Api, req: Request<Body>) -> (StatusCode, Value) {
    let response = router(api.state.clone()).oneshot(req).await.unwrap();
    let status = response.status();
    assert_eq!(response.headers()["cache-control"], "no-store");
    assert!(response.headers().get("access-control-allow-origin").is_none(), "no CORS");
    let bytes = axum::body::to_bytes(response.into_body(), usize::MAX).await.unwrap();
    (status, serde_json::from_slice(&bytes).unwrap_or(Value::Null))
}

async fn capture(api: &Api, texts: &[&str]) -> (StatusCode, Value) {
    let payload = body(texts);
    send(api, post(api).body(Body::from(payload)).unwrap()).await
}

fn count(db: &Db, sql: &'static str) -> i64 {
    db.call_blocking(move |c| Ok(c.query_row(sql, [], |r| r.get(0))?)).unwrap()
}

#[tokio::test]
async fn health_answers_and_proves_the_token_for_a_nonce() {
    let api = api();
    let get = |uri: &str| Request::get(uri).header("host", HOST).body(Body::empty()).unwrap();

    let (status, plain) = send(&api, get("/health")).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(plain, json!({"ok": true, "app": "neural_map", "v": 1}));

    let nonce = "abcdefghijklmnop-1";
    let (_, proved) = send(&api, get(&format!("/health?nonce={nonce}"))).await;
    assert_eq!(proved["proof"], health_proof(&api.token, nonce, PORT));

    let (status, _) = send(&api, get("/health?nonce=short")).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn the_wrong_host_or_a_web_page_origin_is_refused() {
    let api = api();
    let health = |host: &str, origin: Option<&str>| {
        let mut req = Request::get("/health").header("host", host);
        if let Some(o) = origin {
            req = req.header("origin", o);
        }
        req.body(Body::empty()).unwrap()
    };

    assert_eq!(send(&api, health("evil.test", None)).await.0, StatusCode::FORBIDDEN);
    assert_eq!(send(&api, health("127.0.0.1:47832", None)).await.0, StatusCode::FORBIDDEN);
    assert_eq!(send(&api, health("localhost:47831", None)).await.0, StatusCode::OK);
    assert_eq!(
        send(&api, health(HOST, Some("https://gemini.google.com"))).await.0,
        StatusCode::FORBIDDEN
    );
    assert_eq!(
        send(&api, health(HOST, Some("chrome-extension://abcdefghijklmnop"))).await.0,
        StatusCode::OK
    );
}

#[tokio::test]
async fn capture_needs_the_token_before_the_body_is_read() {
    let api = api();
    let unauthenticated = |auth: Option<&str>| {
        let mut req = Request::post("/capture")
            .header("host", HOST)
            .header("content-type", "application/json");
        if let Some(a) = auth {
            req = req.header("authorization", a);
        }
        req.body(Body::from("not json at all")).unwrap()
    };

    let (status, err) = send(&api, unauthenticated(None)).await;
    assert_eq!((status, err["code"].as_str()), (StatusCode::UNAUTHORIZED, Some("unauthorized")));
    let wrong = format!("Bearer {}", "0".repeat(64));
    assert_eq!(send(&api, unauthenticated(Some(&wrong))).await.0, StatusCode::UNAUTHORIZED);
    assert_eq!(count(&api.db, "select count(*) from conversations"), 0);
}

#[tokio::test]
async fn capture_checks_content_type_size_and_shape() {
    let api = api();
    let payload = body(&["q", "a"]);

    let mut text = post(&api).body(Body::from(payload.clone())).unwrap();
    text.headers_mut().insert("content-type", "text/plain".parse().unwrap());
    assert_eq!(send(&api, text).await.0, StatusCode::UNSUPPORTED_MEDIA_TYPE);

    let huge = "x".repeat(MAX_BODY_BYTES + 1);
    let big = post(&api)
        .header("content-length", huge.len())
        .body(Body::from(huge))
        .unwrap();
    assert_eq!(send(&api, big).await.0, StatusCode::PAYLOAD_TOO_LARGE);

    let garbage = post(&api).body(Body::from("{")).unwrap();
    let (status, err) = send(&api, garbage).await;
    assert_eq!((status, err["code"].as_str()), (StatusCode::BAD_REQUEST, Some("bad_json")));

    let v2 = payload.replace("\"v\":1", "\"v\":2");
    let (status, err) = send(&api, post(&api).body(Body::from(v2)).unwrap()).await;
    assert_eq!((status, err["code"].as_str()), (StatusCode::BAD_REQUEST, Some("invalid_input")));
}

#[tokio::test]
async fn a_capture_is_stored_announced_and_debounced_once() {
    let api = api();

    let (status, reply) = capture(&api, &["why is the sky blue", "rayleigh scattering"]).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(reply, json!({"accepted": 2, "changed": true}));
    assert_eq!(count(&api.db, "select count(*) from messages"), 2);
    assert_eq!(count(&api.db, "select count(*) from jobs where kind = 'capture'"), 1);
    let events = api.sink.named(CAPTURE_RECEIVED);
    assert_eq!(events.len(), 1);
    assert_eq!(events[0]["newTurns"], 2);

    let (_, again) = capture(&api, &["why is the sky blue", "rayleigh scattering"]).await;
    assert_eq!(again, json!({"accepted": 0, "changed": false}));
    assert_eq!(api.sink.named(CAPTURE_RECEIVED).len(), 1, "no event for a no-op");
    assert_eq!(count(&api.db, "select count(*) from jobs"), 1);
}

#[tokio::test]
async fn a_client_that_keeps_rewriting_a_chat_is_slowed_down() {
    let api = api();
    capture(&api, &["q", "a0"]).await;

    let mut statuses = Vec::new();
    for i in 1..=BRANCH_CHANGE_LIMIT + 1 {
        let reply = format!("a{i}");
        statuses.push(capture(&api, &["q", &reply]).await.0);
    }

    assert!(statuses[..BRANCH_CHANGE_LIMIT].iter().all(|s| *s == StatusCode::OK));
    assert_eq!(statuses[BRANCH_CHANGE_LIMIT], StatusCode::TOO_MANY_REQUESTS);
}
