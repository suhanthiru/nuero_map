//! User settings stored in the `settings` table, with defaults and validation.

use rusqlite::Connection;
use serde::{Deserialize, Serialize};

use crate::db::repo::settings as repo;
use crate::error::{AppError, AppResult};

/// Writes topic summaries and the weekly review. Opus 5.5 is the newest Opus and cheaper
/// than Opus 5; a stored choice of an older model is kept.
pub const SYNTHESIS_MODELS: &[&str] = &["claude-opus-5-5", "claude-opus-5", "claude-sonnet-5"];
pub const DEFAULT_SYNTHESIS_MODEL: &str = "claude-opus-5-5";
pub const DEFAULT_HALF_LIFE_DAYS: f64 = 14.0;
pub const HALF_LIFE_RANGE_DAYS: (f64, f64) = (1.0, 365.0);
pub const DEFAULT_CAPTURE_PORT: u16 = 47831;
/// Unprivileged ports only, so the listener never needs elevation.
pub const CAPTURE_PORT_RANGE: (u16, u16) = (1024, 65535);

const KEY_MODEL: &str = "synthesis_model";
const KEY_HALF_LIFE: &str = "half_life_days";
const KEY_CAPTURE_ENABLED: &str = "capture_enabled";
const KEY_CAPTURE_PORT: &str = "capture_port";

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub synthesis_model: String,
    pub half_life_days: f64,
    pub has_api_key: bool,
    pub capture_port: u16,
    pub capture_enabled: bool,
    pub embedding_model_ready: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsPatch {
    pub synthesis_model: Option<String>,
    pub half_life_days: Option<f64>,
    pub capture_enabled: Option<bool>,
    pub capture_port: Option<u16>,
}

fn parsed<T: std::str::FromStr>(conn: &Connection, key: &str, default: T) -> AppResult<T> {
    Ok(repo::get(conn, key)?
        .and_then(|v| v.parse().ok())
        .unwrap_or(default))
}

/// Settings from the database; `has_api_key` and model readiness come from elsewhere.
pub fn load(
    conn: &Connection,
    has_api_key: bool,
    embedding_model_ready: bool,
) -> AppResult<Settings> {
    Ok(Settings {
        synthesis_model: repo::get(conn, KEY_MODEL)?
            .filter(|m| SYNTHESIS_MODELS.contains(&m.as_str()))
            .unwrap_or_else(|| DEFAULT_SYNTHESIS_MODEL.to_owned()),
        half_life_days: parsed(conn, KEY_HALF_LIFE, DEFAULT_HALF_LIFE_DAYS)?,
        has_api_key,
        capture_port: parsed(conn, KEY_CAPTURE_PORT, DEFAULT_CAPTURE_PORT)?,
        // Off until the user pairs the extension, so nothing listens on a fresh install.
        capture_enabled: parsed(conn, KEY_CAPTURE_ENABLED, false)?,
        embedding_model_ready,
    })
}

pub fn half_life_days(conn: &Connection) -> AppResult<f64> {
    parsed(conn, KEY_HALF_LIFE, DEFAULT_HALF_LIFE_DAYS)
}

pub fn synthesis_model(conn: &Connection) -> AppResult<String> {
    Ok(load(conn, false, false)?.synthesis_model)
}

/// Validates every field first, then writes; a bad patch changes nothing.
pub fn apply(conn: &Connection, patch: &SettingsPatch) -> AppResult<()> {
    if let Some(model) = &patch.synthesis_model {
        if !SYNTHESIS_MODELS.contains(&model.as_str()) {
            return Err(AppError::InvalidInput(format!(
                "unknown synthesis model {model}"
            )));
        }
    }
    if let Some(days) = patch.half_life_days {
        let (min, max) = HALF_LIFE_RANGE_DAYS;
        if !(min..=max).contains(&days) {
            return Err(AppError::InvalidInput(format!(
                "half-life must be between {min} and {max} days"
            )));
        }
    }
    if let Some(port) = patch.capture_port {
        let (min, max) = CAPTURE_PORT_RANGE;
        if !(min..=max).contains(&port) {
            return Err(AppError::InvalidInput(format!(
                "capture port must be between {min} and {max}"
            )));
        }
    }
    if let Some(model) = &patch.synthesis_model {
        repo::set(conn, KEY_MODEL, model)?;
    }
    if let Some(days) = patch.half_life_days {
        repo::set(conn, KEY_HALF_LIFE, &days.to_string())?;
    }
    if let Some(enabled) = patch.capture_enabled {
        repo::set(conn, KEY_CAPTURE_ENABLED, &enabled.to_string())?;
    }
    if let Some(port) = patch.capture_port {
        repo::set(conn, KEY_CAPTURE_PORT, &port.to_string())?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Db;

    #[test]
    fn defaults_then_patches_and_rejects_bad_values_atomically() {
        let db = Db::open_in_memory().unwrap();

        db.call_blocking(|c| {
            let s = load(c, false, false)?;
            assert_eq!(
                (s.synthesis_model.as_str(), s.half_life_days),
                ("claude-opus-5-5", 14.0)
            );

            apply(
                c,
                &SettingsPatch {
                    synthesis_model: Some("claude-sonnet-5".into()),
                    half_life_days: Some(21.0),
                    ..Default::default()
                },
            )?;
            let s = load(c, true, false)?;
            assert_eq!(
                (s.synthesis_model.as_str(), s.half_life_days, s.has_api_key),
                ("claude-sonnet-5", 21.0, true)
            );

            let bad = SettingsPatch {
                synthesis_model: Some("claude-opus-5".into()),
                half_life_days: Some(0.0),
                ..Default::default()
            };
            assert_eq!(apply(c, &bad).unwrap_err().code(), "invalid_input");
            assert_eq!(
                load(c, true, false)?.synthesis_model,
                "claude-sonnet-5",
                "nothing written on error"
            );
            Ok(())
        })
        .unwrap();
    }

    #[test]
    fn capture_is_off_by_default_and_port_is_validated() {
        let db = Db::open_in_memory().unwrap();

        db.call_blocking(|c| {
            let s = load(c, false, false)?;
            assert_eq!((s.capture_enabled, s.capture_port), (false, DEFAULT_CAPTURE_PORT));

            let low = SettingsPatch {
                capture_enabled: Some(true),
                capture_port: Some(1023),
                ..Default::default()
            };
            assert_eq!(apply(c, &low).unwrap_err().code(), "invalid_input");
            assert!(!load(c, false, false)?.capture_enabled, "nothing written on error");

            apply(
                c,
                &SettingsPatch {
                    capture_enabled: Some(true),
                    capture_port: Some(65535),
                    ..Default::default()
                },
            )?;
            let s = load(c, false, false)?;
            assert_eq!((s.capture_enabled, s.capture_port), (true, 65535));
            Ok(())
        })
        .unwrap();
    }
}
