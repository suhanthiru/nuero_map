use std::sync::Arc;

use neural_map_lib::error::AppError;
use neural_map_lib::llm::http::AnthropicHttp;
use neural_map_lib::llm::types::{BatchOutcome, BatchRequest, Message, MessageRequest};
use neural_map_lib::llm::LlmClient;
use neural_map_lib::secrets::{ApiKeyStore, MemoryStore};
use serde_json::json;
use wiremock::matchers::{body_partial_json, header, method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};

const KEY: &str = "sk-ant-test-key-0123456789";

fn request() -> MessageRequest {
    MessageRequest {
        model: "claude-haiku-4-5".into(),
        max_tokens: 100,
        system: vec![],
        messages: vec![Message::user_text("hi")],
        output_config: None,
        thinking: None,
        fallbacks: None,
    }
}

fn message_body() -> serde_json::Value {
    json!({
        "id": "msg_1", "type": "message", "role": "assistant", "model": "claude-haiku-4-5",
        "content": [{"type": "text", "text": "{\"ideas\":[]}"}],
        "stop_reason": "end_turn",
        "usage": {"input_tokens": 10, "output_tokens": 5, "cache_read_input_tokens": 4200}
    })
}

fn client(server: &MockServer, keys: Arc<dyn ApiKeyStore>) -> Arc<AnthropicHttp> {
    let http = AnthropicHttp::with_base_url(keys, tokio::runtime::Handle::current(), &server.uri())
        .unwrap()
        .with_retry_policy(3, 1);
    Arc::new(http)
}

/// The client is blocking; call it off the async test thread.
async fn blocking<T: Send + 'static>(f: impl FnOnce() -> T + Send + 'static) -> T {
    tokio::task::spawn_blocking(f).await.unwrap()
}

#[tokio::test(flavor = "multi_thread")]
async fn sends_auth_and_version_headers_and_parses_the_reply() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/v1/messages"))
        .and(header("x-api-key", KEY))
        .and(header("anthropic-version", "2023-06-01"))
        .and(body_partial_json(
            json!({"model": "claude-haiku-4-5", "max_tokens": 100}),
        ))
        .respond_with(ResponseTemplate::new(200).set_body_json(message_body()))
        .expect(1)
        .mount(&server)
        .await;
    let c = client(&server, Arc::new(MemoryStore::with_key(KEY)));

    let reply = blocking(move || c.create_message(&request()))
        .await
        .unwrap();

    assert_eq!(reply.text(), "{\"ideas\":[]}");
    assert_eq!(reply.usage.cache_read_input_tokens, 4200);
}

#[tokio::test(flavor = "multi_thread")]
async fn retries_rate_limits_and_server_errors_then_succeeds() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/v1/messages"))
        .respond_with(ResponseTemplate::new(429).insert_header("retry-after", "0"))
        .up_to_n_times(1)
        .mount(&server)
        .await;
    Mock::given(method("POST"))
        .and(path("/v1/messages"))
        .respond_with(ResponseTemplate::new(529).set_body_json(
            json!({"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}),
        ))
        .up_to_n_times(1)
        .mount(&server)
        .await;
    Mock::given(method("POST"))
        .and(path("/v1/messages"))
        .respond_with(ResponseTemplate::new(200).set_body_json(message_body()))
        .mount(&server)
        .await;
    let c = client(&server, Arc::new(MemoryStore::with_key(KEY)));

    let reply = blocking(move || c.create_message(&request())).await;

    assert!(reply.is_ok(), "{reply:?}");
    assert_eq!(server.received_requests().await.unwrap().len(), 3);
}

#[tokio::test(flavor = "multi_thread")]
async fn does_not_retry_bad_requests_or_bad_keys() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/v1/messages"))
        .respond_with(ResponseTemplate::new(400).set_body_json(json!({"type":"error","error":{"type":"invalid_request_error","message":"max_tokens too large"}})))
        .expect(1)
        .mount(&server)
        .await;
    Mock::given(method("GET"))
        .and(path("/v1/models"))
        .respond_with(ResponseTemplate::new(401))
        .expect(1)
        .mount(&server)
        .await;
    let c = client(&server, Arc::new(MemoryStore::with_key(KEY)));
    let c2 = c.clone();

    let bad_request = blocking(move || c.create_message(&request()))
        .await
        .unwrap_err();
    let bad_key = blocking(move || c2.check_key()).await.unwrap_err();

    assert!(
        matches!(bad_request, AppError::Api { status: 400, ref message } if message == "max_tokens too large")
    );
    assert!(matches!(bad_key, AppError::InvalidApiKey));
}

#[tokio::test(flavor = "multi_thread")]
async fn missing_key_fails_before_any_request() {
    let server = MockServer::start().await;
    let c = client(&server, Arc::new(MemoryStore::default()));

    let err = blocking(move || c.create_message(&request()))
        .await
        .unwrap_err();

    assert!(matches!(err, AppError::NoApiKey));
    assert!(server.received_requests().await.unwrap().is_empty());
}

#[tokio::test(flavor = "multi_thread")]
async fn creates_polls_and_reads_batch_results_keyed_by_custom_id() {
    let server = MockServer::start().await;
    let results_url = format!("{}/results/msgbatch_1.jsonl", server.uri());
    Mock::given(method("POST"))
        .and(path("/v1/messages/batches"))
        .and(body_partial_json(json!({"requests": [{"custom_id": "win-1"}, {"custom_id": "win-2"}]})))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({"id": "msgbatch_1", "processing_status": "in_progress", "request_counts": {"processing": 3}})))
        .mount(&server)
        .await;
    Mock::given(method("GET"))
        .and(path("/v1/messages/batches/msgbatch_1"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "id": "msgbatch_1", "processing_status": "ended",
            "request_counts": {"succeeded": 1, "errored": 1, "expired": 1}, "results_url": results_url
        })))
        .mount(&server)
        .await;
    let lines = [
        json!({"custom_id": "win-3", "result": {"type": "expired"}}).to_string(),
        json!({"custom_id": "win-2", "result": {"type": "errored", "error": {"type": "error", "error": {"type": "invalid_request_error", "message": "bad"}}}}).to_string(),
        json!({"custom_id": "win-1", "result": {"type": "succeeded", "message": message_body()}}).to_string(),
    ];
    Mock::given(method("GET"))
        .and(path("/results/msgbatch_1.jsonl"))
        .and(header("x-api-key", KEY))
        .respond_with(ResponseTemplate::new(200).set_body_string(lines.join("\n") + "\n"))
        .mount(&server)
        .await;
    let c = client(&server, Arc::new(MemoryStore::with_key(KEY)));
    let reqs: Vec<BatchRequest> = (1..=3)
        .map(|i| BatchRequest {
            custom_id: format!("win-{i}"),
            params: request(),
        })
        .collect();

    let (created, polled, results) = blocking(move || {
        let created = c.create_batch(&reqs).unwrap();
        let polled = c.get_batch(&created.id).unwrap();
        let results = c.batch_results(&polled).unwrap();
        (created, polled, results)
    })
    .await;

    assert!(!created.is_ended());
    assert!(polled.is_ended());
    assert_eq!(results.len(), 3);
    let by_id = |id: &str| &results.iter().find(|r| r.custom_id == id).unwrap().result;
    assert!(matches!(by_id("win-1"), BatchOutcome::Succeeded { .. }));
    assert!(by_id("win-2").is_invalid_request());
    assert!(matches!(by_id("win-3"), BatchOutcome::Expired));
}
