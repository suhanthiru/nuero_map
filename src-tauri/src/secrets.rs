//! Secrets (the Anthropic API key, the browser-extension pairing token) live in the OS
//! credential store (Windows Credential Manager), never in the database or a config file.

use std::sync::RwLock;

use crate::error::{AppError, AppResult};

const SERVICE: &str = "neural_map";
const ACCOUNT: &str = "anthropic_api_key";

pub trait ApiKeyStore: Send + Sync {
    fn get(&self) -> AppResult<Option<String>>;
    fn set(&self, key: &str) -> AppResult<()>;
    fn clear(&self) -> AppResult<()>;

    /// The key, or `NoApiKey`.
    fn require(&self) -> AppResult<String> {
        self.get()?.ok_or(AppError::NoApiKey)
    }
}

/// OS keychain, with an in-memory cache so every API call doesn't hit the store.
pub struct KeyringStore {
    account: &'static str,
    cache: RwLock<Option<String>>,
}

impl Default for KeyringStore {
    /// The Anthropic API key.
    fn default() -> Self {
        Self::for_account(ACCOUNT)
    }
}

impl KeyringStore {
    /// Another secret under this app's service name.
    pub fn for_account(account: &'static str) -> Self {
        Self {
            account,
            cache: RwLock::new(None),
        }
    }

    fn entry(&self) -> AppResult<keyring::Entry> {
        keyring::Entry::new(SERVICE, self.account).map_err(|e| AppError::Secrets(e.to_string()))
    }
}

impl ApiKeyStore for KeyringStore {
    fn get(&self) -> AppResult<Option<String>> {
        if let Some(key) = self.cache.read().ok().and_then(|c| c.clone()) {
            return Ok(Some(key));
        }
        let key = match self.entry()?.get_password() {
            Ok(key) => Some(key),
            Err(keyring::Error::NoEntry) => None,
            Err(e) => return Err(AppError::Secrets(e.to_string())),
        };
        if let Ok(mut cache) = self.cache.write() {
            cache.clone_from(&key);
        }
        Ok(key)
    }

    fn set(&self, key: &str) -> AppResult<()> {
        self.entry()?
            .set_password(key)
            .map_err(|e| AppError::Secrets(e.to_string()))?;
        if let Ok(mut cache) = self.cache.write() {
            *cache = Some(key.to_owned());
        }
        Ok(())
    }

    fn clear(&self) -> AppResult<()> {
        match self.entry()?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => {}
            Err(e) => return Err(AppError::Secrets(e.to_string())),
        }
        if let Ok(mut cache) = self.cache.write() {
            *cache = None;
        }
        Ok(())
    }
}

/// In-memory store for tests.
#[derive(Default)]
pub struct MemoryStore {
    key: RwLock<Option<String>>,
}

impl MemoryStore {
    pub fn with_key(key: &str) -> Self {
        Self {
            key: RwLock::new(Some(key.to_owned())),
        }
    }
}

impl ApiKeyStore for MemoryStore {
    fn get(&self) -> AppResult<Option<String>> {
        Ok(self.key.read().ok().and_then(|k| k.clone()))
    }

    fn set(&self, key: &str) -> AppResult<()> {
        if let Ok(mut k) = self.key.write() {
            *k = Some(key.to_owned());
        }
        Ok(())
    }

    fn clear(&self) -> AppResult<()> {
        if let Ok(mut k) = self.key.write() {
            *k = None;
        }
        Ok(())
    }
}

/// Basic shape check before we store or send a key. Never logs the key.
pub fn validate_key_shape(key: &str) -> AppResult<String> {
    let trimmed = key.trim();
    let plausible = trimmed.starts_with("sk-ant-")
        && trimmed.len() > 20
        && !trimmed.contains(char::is_whitespace);
    if plausible {
        Ok(trimmed.to_owned())
    } else {
        Err(AppError::InvalidApiKey)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn memory_store_round_trips_and_requires() {
        let store = MemoryStore::default();
        assert!(matches!(store.require(), Err(AppError::NoApiKey)));

        store.set("k").unwrap();
        assert_eq!(store.require().unwrap(), "k");

        store.clear().unwrap();
        assert_eq!(store.get().unwrap(), None);
    }

    #[test]
    fn rejects_implausible_keys() {
        assert!(validate_key_shape("  sk-ant-api03-abcdefghijklmnopqrstuvwxyz  ").is_ok());
        assert!(validate_key_shape("sk-proj-123").is_err());
        assert!(validate_key_shape("sk-ant-short").is_err());
        assert!(validate_key_shape("sk-ant-api03-abc def ghijklmnopqrstu").is_err());
    }
}
