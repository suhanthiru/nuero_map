//! Wire types for the Anthropic Messages and Message Batches APIs (raw HTTP; there is no
//! official Rust SDK). Only the fields this app uses are modelled; unknown response
//! fields are ignored.

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct CacheControl {
    #[serde(rename = "type")]
    pub kind: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ttl: Option<&'static str>,
}

impl CacheControl {
    /// One-hour cache: batch requests can be processed well past the 5-minute default.
    pub fn one_hour() -> Self {
        Self {
            kind: "ephemeral",
            ttl: Some("1h"),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct SystemBlock {
    #[serde(rename = "type")]
    pub kind: &'static str,
    pub text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cache_control: Option<CacheControl>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Message {
    pub role: &'static str,
    /// A plain string or an array of content blocks.
    pub content: Value,
}

impl Message {
    pub fn user_text(text: impl Into<String>) -> Self {
        Self {
            role: "user",
            content: Value::String(text.into()),
        }
    }

    pub fn user_blocks(blocks: Vec<Value>) -> Self {
        Self {
            role: "user",
            content: Value::Array(blocks),
        }
    }
}

#[derive(Debug, Clone, Default, PartialEq, Serialize)]
pub struct OutputConfig {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub format: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub effort: Option<&'static str>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct MessageRequest {
    pub model: String,
    pub max_tokens: u32,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub system: Vec<SystemBlock>,
    pub messages: Vec<Message>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output_config: Option<OutputConfig>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thinking: Option<Value>,
    /// Server-side refusal fallback ("default"); needs a beta header and isn't allowed
    /// on Batches. See `llm::refusal_fallback`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fallbacks: Option<&'static str>,
}

#[derive(Debug, Clone, Default, PartialEq, Deserialize)]
#[serde(default)]
pub struct Usage {
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cache_creation_input_tokens: u64,
    pub cache_read_input_tokens: u64,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct ContentBlock {
    #[serde(rename = "type")]
    pub kind: String,
    #[serde(default)]
    pub text: Option<String>,
    #[serde(default)]
    pub citations: Option<Vec<Value>>,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct MessageResponse {
    pub id: String,
    pub model: String,
    #[serde(default)]
    pub content: Vec<ContentBlock>,
    #[serde(default)]
    pub stop_reason: Option<String>,
    #[serde(default)]
    pub stop_details: Option<Value>,
    #[serde(default)]
    pub usage: Usage,
}

impl MessageResponse {
    /// The reply's text, or an error when Claude declined or ran out of tokens (either
    /// way the text isn't a complete answer).
    pub fn finished_text(&self) -> AppResult<String> {
        match self.stop_reason.as_deref() {
            Some("refusal") => {
                let category = self
                    .stop_details
                    .as_ref()
                    .and_then(|d| d.get("category"))
                    .and_then(|c| c.as_str())
                    .unwrap_or("unspecified");
                Err(AppError::Refused(category.to_owned()))
            }
            Some("max_tokens") => Err(AppError::Api {
                status: 200,
                message: "the reply was cut off at max_tokens".into(),
            }),
            _ => Ok(self.text()),
        }
    }

    /// All text blocks joined, in order.
    pub fn text(&self) -> String {
        self.content
            .iter()
            .filter(|b| b.kind == "text")
            .filter_map(|b| b.text.as_deref())
            .collect::<Vec<_>>()
            .join("")
    }
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct BatchRequest {
    pub custom_id: String,
    pub params: MessageRequest,
}

#[derive(Debug, Clone, Default, PartialEq, Deserialize)]
#[serde(default)]
pub struct RequestCounts {
    pub processing: u64,
    pub succeeded: u64,
    pub errored: u64,
    pub canceled: u64,
    pub expired: u64,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct BatchInfo {
    pub id: String,
    /// "in_progress" | "canceling" | "ended"
    pub processing_status: String,
    #[serde(default)]
    pub request_counts: RequestCounts,
    #[serde(default)]
    pub results_url: Option<String>,
    #[serde(default)]
    pub expires_at: Option<String>,
}

impl BatchInfo {
    pub fn is_ended(&self) -> bool {
        self.processing_status == "ended"
    }
}

/// One JSONL line of batch results. Results arrive in any order: key by custom_id.
#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct BatchResultLine {
    pub custom_id: String,
    pub result: BatchOutcome,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum BatchOutcome {
    Succeeded {
        message: MessageResponse,
    },
    Errored {
        #[serde(default)]
        error: Value,
    },
    Canceled,
    Expired,
}

impl BatchOutcome {
    /// Errored results caused by our request (not the server) should not be resubmitted.
    pub fn is_invalid_request(&self) -> bool {
        let BatchOutcome::Errored { error } = self else {
            return false;
        };
        error.to_string().contains("invalid_request")
    }
}
