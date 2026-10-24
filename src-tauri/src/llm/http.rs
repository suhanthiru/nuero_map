//! Raw-HTTP Anthropic client (reqwest). Retries 429/5xx/529 and connection errors with
//! backoff that honours `retry-after`.

use std::sync::Arc;
use std::time::Duration;

use reqwest::{Method, RequestBuilder, Response, StatusCode};
use serde::de::DeserializeOwned;
use tokio::runtime::Handle;

use super::types::{BatchInfo, BatchRequest, BatchResultLine, MessageRequest, MessageResponse};
use super::LlmClient;
use crate::config::llm::{
    API_BASE_URL, API_VERSION, FALLBACK_BETA, HTTP_TIMEOUT_SECS, MAX_HTTP_RETRIES,
    RETRY_AFTER_CAP_SECS, RETRY_BASE_MS,
};
use crate::error::{AppError, AppResult};
use crate::secrets::ApiKeyStore;

pub struct AnthropicHttp {
    client: reqwest::Client,
    base_url: String,
    keys: Arc<dyn ApiKeyStore>,
    runtime: Handle,
    max_retries: u32,
    retry_base_ms: u64,
}

impl AnthropicHttp {
    pub fn new(keys: Arc<dyn ApiKeyStore>, runtime: Handle) -> AppResult<Self> {
        Self::with_base_url(keys, runtime, API_BASE_URL)
    }

    pub fn with_base_url(
        keys: Arc<dyn ApiKeyStore>,
        runtime: Handle,
        base_url: &str,
    ) -> AppResult<Self> {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(HTTP_TIMEOUT_SECS))
            .build()
            .map_err(|e| AppError::internal(format!("http client: {e}")))?;
        Ok(Self {
            client,
            base_url: base_url.trim_end_matches('/').to_owned(),
            keys,
            runtime,
            max_retries: MAX_HTTP_RETRIES,
            retry_base_ms: RETRY_BASE_MS,
        })
    }

    /// Overrides retry count and backoff base (tests use a tiny base).
    pub fn with_retry_policy(mut self, max_retries: u32, retry_base_ms: u64) -> Self {
        self.max_retries = max_retries;
        self.retry_base_ms = retry_base_ms;
        self
    }

    fn request(&self, method: Method, path_or_url: &str, key: &str) -> RequestBuilder {
        let url = if path_or_url.starts_with("http") {
            path_or_url.to_owned()
        } else {
            format!("{}{}", self.base_url, path_or_url)
        };
        self.client
            .request(method, url)
            .header("x-api-key", key)
            .header("anthropic-version", API_VERSION)
    }

    /// Sends with retries and returns the successful response body as text.
    fn send_text(&self, build: impl Fn(&str) -> RequestBuilder) -> AppResult<String> {
        let key = self.keys.require()?;
        let mut attempt = 0;
        loop {
            let outcome = self.runtime.block_on(async {
                let response = build(&key).send().await.map_err(network)?;
                read_body(response).await
            });
            match outcome {
                Err(e) if e.is_retryable() && attempt < self.max_retries => {
                    let wait = retry_delay(&e, attempt, self.retry_base_ms);
                    tracing::warn!(attempt, wait_ms = wait.as_millis() as u64, error = %e, "retrying Anthropic request");
                    std::thread::sleep(wait);
                    attempt += 1;
                }
                other => return other,
            }
        }
    }

    fn send_json<T: DeserializeOwned>(
        &self,
        build: impl Fn(&str) -> RequestBuilder,
    ) -> AppResult<T> {
        let body = self.send_text(build)?;
        serde_json::from_str(&body).map_err(|e| AppError::Api {
            status: 200,
            message: format!("unexpected response shape: {e}"),
        })
    }
}

fn network(e: reqwest::Error) -> AppError {
    AppError::Network(e.without_url().to_string())
}

async fn read_body(response: Response) -> AppResult<String> {
    let status = response.status();
    let retry_after = response
        .headers()
        .get("retry-after")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.trim().parse::<u64>().ok());
    let body = response.text().await.map_err(network)?;
    if status.is_success() {
        return Ok(body);
    }
    Err(status_error(status, retry_after, &body))
}

fn status_error(status: StatusCode, retry_after_secs: Option<u64>, body: &str) -> AppError {
    let message = serde_json::from_str::<serde_json::Value>(body)
        .ok()
        .and_then(|v| {
            v.pointer("/error/message")
                .and_then(|m| m.as_str())
                .map(str::to_owned)
        })
        .unwrap_or_else(|| body.chars().take(300).collect());
    match status.as_u16() {
        401 | 403 => AppError::InvalidApiKey,
        429 => AppError::RateLimited { retry_after_secs },
        code => AppError::Api {
            status: code,
            message,
        },
    }
}

fn retry_delay(error: &AppError, attempt: u32, base_ms: u64) -> Duration {
    if let AppError::RateLimited {
        retry_after_secs: Some(secs),
    } = error
    {
        return Duration::from_secs((*secs).min(RETRY_AFTER_CAP_SECS));
    }
    Duration::from_millis(base_ms.saturating_mul(1 << attempt.min(6)))
}

impl LlmClient for AnthropicHttp {
    fn create_message(&self, request: &MessageRequest) -> AppResult<MessageResponse> {
        self.send_json(|key| {
            let builder = self.request(Method::POST, "/v1/messages", key);
            let builder = match request.fallbacks {
                Some(_) => builder.header("anthropic-beta", FALLBACK_BETA),
                None => builder,
            };
            builder.json(request)
        })
    }

    fn create_batch(&self, requests: &[BatchRequest]) -> AppResult<BatchInfo> {
        let body = serde_json::json!({ "requests": requests });
        self.send_json(|key| {
            self.request(Method::POST, "/v1/messages/batches", key)
                .json(&body)
        })
    }

    fn get_batch(&self, batch_id: &str) -> AppResult<BatchInfo> {
        let path = format!("/v1/messages/batches/{batch_id}");
        self.send_json(|key| self.request(Method::GET, &path, key))
    }

    fn batch_results(&self, batch: &BatchInfo) -> AppResult<Vec<BatchResultLine>> {
        let url = batch
            .results_url
            .clone()
            .unwrap_or_else(|| format!("/v1/messages/batches/{}/results", batch.id));
        let body = self.send_text(|key| self.request(Method::GET, &url, key))?;
        body.lines()
            .filter(|l| !l.trim().is_empty())
            .map(|line| {
                serde_json::from_str(line).map_err(|e| AppError::Api {
                    status: 200,
                    message: format!("unreadable batch result line: {e}"),
                })
            })
            .collect()
    }

    fn check_key(&self) -> AppResult<()> {
        self.send_text(|key| self.request(Method::GET, "/v1/models?limit=1", key))
            .map(|_| ())
    }
}
