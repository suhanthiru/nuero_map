//! Chat export ingestion: detect → stream-parse → normalize → upsert.

pub mod archive;
pub mod chatgpt;
pub mod claude;
pub mod detect;
pub mod fingerprint;
pub mod import;
pub mod model;
pub mod stream;
mod time;

use std::io::Read;
use std::ops::ControlFlow;

use serde::{Deserialize, Deserializer};
use serde_json::value::RawValue;

use crate::error::AppResult;
use model::{NormalizedConversation, ParseStats, ParseWarning};

type Normalizer = fn(&RawValue) -> Result<NormalizedConversation, ParseWarning>;

/// Streams `reader`, normalizing each element; bad elements become warnings, not errors.
/// `should_stop` is polled between elements for cooperative cancellation.
fn drive<R: Read>(
    reader: R,
    normalize: Normalizer,
    mut on_conversation: impl FnMut(NormalizedConversation),
    should_stop: &dyn Fn() -> bool,
) -> AppResult<ParseStats> {
    let mut stats = ParseStats::default();
    let streamed = stream::for_each_element(reader, |raw| {
        match normalize(&raw) {
            Ok(conversation) => {
                stats.conversations += 1;
                on_conversation(conversation);
            }
            Err(warning) => stats.warnings.push(warning),
        }
        if should_stop() {
            ControlFlow::Break(())
        } else {
            ControlFlow::Continue(())
        }
    })?;
    stats.elements = streamed.count;
    stats.stopped = streamed.stopped;
    Ok(stats)
}

/// A `should_stop` that never stops.
pub fn never_stop() -> bool {
    false
}

/// Treats JSON `null` as the type's default (exports use null and [] interchangeably).
fn null_default<'de, D, T>(deserializer: D) -> Result<T, D::Error>
where
    D: Deserializer<'de>,
    T: Default + Deserialize<'de>,
{
    Ok(Option::<T>::deserialize(deserializer)?.unwrap_or_default())
}

/// Non-empty trimmed text, or None.
fn non_blank(text: &str) -> Option<String> {
    let trimmed = text.trim();
    (!trimmed.is_empty()).then(|| trimmed.to_owned())
}
