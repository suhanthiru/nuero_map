use serde::ser::SerializeStruct;
use serde::{Serialize, Serializer};

pub type AppResult<T> = Result<T, AppError>;

/// Every fallible backend operation returns this. It serializes to the frontend's
/// `BackendError { code, message }`, where `code` is stable and `message` is for logs.
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("database error: {0}")]
    Db(#[from] rusqlite::Error),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("zip error: {0}")]
    Zip(#[from] zip::result::ZipError),
    #[error("json error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("not a supported chat export: {0}")]
    BadExport(String),
    #[error("not found: {0}")]
    NotFound(String),
    #[error("cancelled")]
    Cancelled,
    #[error("busy: {0}")]
    Busy(String),
    #[error("no Anthropic API key is configured")]
    NoApiKey,
    #[error("Anthropic rejected the API key")]
    InvalidApiKey,
    #[error("rate limited by Anthropic")]
    RateLimited { retry_after_secs: Option<u64> },
    #[error("Anthropic API error {status}: {message}")]
    Api { status: u16, message: String },
    #[error("network error: {0}")]
    Network(String),
    #[error("secret store error: {0}")]
    Secrets(String),
    #[error("invalid input: {0}")]
    InvalidInput(String),
    /// The name is already taken by a sibling (note titles and folder names are unique per folder).
    #[error("conflict: {0}")]
    Conflict(String),
    #[error("embedding model error: {0}")]
    Embedding(String),
    #[error("not available yet: {0}")]
    NotAvailable(String),
    #[error("Claude declined the request (category: {0})")]
    Refused(String),
    #[error("{0}")]
    Internal(String),
}

impl AppError {
    pub fn code(&self) -> &'static str {
        match self {
            AppError::Db(_) => "database",
            AppError::Io(_) => "io",
            AppError::Zip(_) | AppError::BadExport(_) => "bad_zip",
            AppError::Json(_) => "bad_json",
            AppError::NotFound(_) => "not_found",
            AppError::Cancelled => "cancelled",
            AppError::Busy(_) => "busy",
            AppError::NoApiKey => "no_api_key",
            AppError::InvalidApiKey => "invalid_api_key",
            AppError::RateLimited { .. } => "rate_limited",
            AppError::Api { .. } => "api_error",
            AppError::Network(_) => "network",
            AppError::Secrets(_) => "secrets",
            AppError::InvalidInput(_) => "invalid_input",
            AppError::Conflict(_) => "conflict",
            AppError::Embedding(_) => "model_unavailable",
            AppError::NotAvailable(_) => "not_available",
            AppError::Refused(_) => "refused",
            AppError::Internal(_) => "internal",
        }
    }

    /// Worth retrying later (transient). Bad input, auth problems, and bugs are not.
    pub fn is_retryable(&self) -> bool {
        match self {
            AppError::RateLimited { .. } | AppError::Network(_) => true,
            AppError::Api { status, .. } => *status >= 500,
            AppError::Db(rusqlite::Error::SqliteFailure(e, _)) => {
                e.code == rusqlite::ErrorCode::DatabaseBusy
                    || e.code == rusqlite::ErrorCode::DatabaseLocked
            }
            _ => false,
        }
    }

    pub fn internal(message: impl Into<String>) -> Self {
        AppError::Internal(message.into())
    }
}

impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut s = serializer.serialize_struct("BackendError", 2)?;
        s.serialize_field("code", self.code())?;
        s.serialize_field("message", &self.to_string())?;
        s.end()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializes_to_code_and_message() {
        let err = AppError::NotFound("topic 7".into());

        let json = serde_json::to_value(&err).unwrap();

        assert_eq!(
            json,
            serde_json::json!({"code": "not_found", "message": "not found: topic 7"})
        );
    }

    #[test]
    fn only_transient_api_failures_are_retryable() {
        assert!(AppError::RateLimited {
            retry_after_secs: Some(3)
        }
        .is_retryable());
        assert!(AppError::Network("reset".into()).is_retryable());
        assert!(AppError::Api {
            status: 529,
            message: "overloaded".into()
        }
        .is_retryable());
        assert!(!AppError::Api {
            status: 400,
            message: "bad".into()
        }
        .is_retryable());
        assert!(!AppError::InvalidApiKey.is_retryable());
        assert!(!AppError::NoApiKey.is_retryable());
    }

    #[test]
    fn export_problems_share_the_bad_zip_code() {
        assert_eq!(AppError::BadExport("x".into()).code(), "bad_zip");
        assert_eq!(
            AppError::Zip(zip::result::ZipError::FileNotFound).code(),
            "bad_zip"
        );
    }
}
