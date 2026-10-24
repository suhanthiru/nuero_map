//! Renders a window as a tagged transcript and builds the extraction request.

use serde_json::json;

use super::prompt::{output_schema, SYSTEM_PROMPT};
use super::windows::Part;
use crate::config::llm::{EXTRACTION_MAX_TOKENS, EXTRACTION_MODEL};
use crate::llm::types::{CacheControl, Message, MessageRequest, OutputConfig, SystemBlock};

/// Everything needed to render one window and map indices back to messages.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WindowInput {
    pub window_id: i64,
    pub conversation_title: String,
    pub source: String,
    pub context: Vec<Part>,
    pub parts: Vec<Part>,
}

/// Message text may itself contain our tags; neutralize closing tags so it can't end a
/// message early. `unescape` reverses this before excerpts are verified.
pub(crate) fn escape(text: &str) -> String {
    text.replace("</", "<\\/")
}

pub fn unescape(text: &str) -> String {
    text.replace("<\\/", "</")
}

pub(crate) fn attr(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('"', "&quot;")
        .replace('<', "&lt;")
}

fn render_msg(part: &Part, index: Option<usize>) -> String {
    let i = index.map(|i| format!(" i=\"{i}\"")).unwrap_or_default();
    format!(
        "<msg{i} role=\"{}\" ts=\"{}\">{}</msg>",
        part.role,
        attr(&part.created_at),
        escape(&part.text)
    )
}

pub fn render_transcript(input: &WindowInput) -> String {
    let mut out = format!(
        "<conversation title=\"{}\" source=\"{}\">\n",
        attr(&input.conversation_title),
        attr(&input.source)
    );
    if !input.context.is_empty() {
        out.push_str("<context>\n");
        for part in &input.context {
            out.push_str(&render_msg(part, None));
            out.push('\n');
        }
        out.push_str("</context>\n");
    }
    for (i, part) in input.parts.iter().enumerate() {
        out.push_str(&render_msg(part, Some(i)));
        out.push('\n');
    }
    out.push_str("</conversation>");
    out
}

pub fn custom_id(window_id: i64) -> String {
    format!("win-{window_id}")
}

pub fn window_id_from_custom_id(custom_id: &str) -> Option<i64> {
    custom_id.strip_prefix("win-")?.parse().ok()
}

/// Same system block and schema for every request, so the prompt cache and the
/// compiled-grammar cache both hit.
pub fn build_request(input: &WindowInput) -> MessageRequest {
    MessageRequest {
        model: EXTRACTION_MODEL.to_owned(),
        max_tokens: EXTRACTION_MAX_TOKENS,
        system: vec![SystemBlock {
            kind: "text",
            text: SYSTEM_PROMPT.to_owned(),
            cache_control: Some(CacheControl::one_hour()),
        }],
        messages: vec![Message::user_text(render_transcript(input))],
        output_config: Some(OutputConfig {
            format: Some(json!({"type": "json_schema", "schema": output_schema()})),
            effort: None,
        }),
        // Haiku 4.5 does not take adaptive thinking; extraction runs without thinking.
        thinking: None,
        // Batches reject server-side fallback.
        fallbacks: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn part(id: i64, role: &str, text: &str) -> Part {
        Part {
            message_id: id,
            seq: id,
            role: role.into(),
            text: text.into(),
            created_at: "2026-01-01T00:00:00.000000Z".into(),
            part_index: 0,
            part_count: 1,
        }
    }

    #[test]
    fn renders_context_without_indices_and_window_messages_with_them() {
        let input = WindowInput {
            window_id: 7,
            conversation_title: "Say \"hi\"".into(),
            source: "claude".into(),
            context: vec![part(1, "user", "earlier")],
            parts: vec![
                part(2, "user", "a </msg> trick"),
                part(3, "assistant", "reply"),
            ],
        };

        let text = render_transcript(&input);

        assert!(text.starts_with("<conversation title=\"Say &quot;hi&quot;\" source=\"claude\">"));
        assert!(text.contains("<context>\n<msg role=\"user\""));
        assert!(text.contains("<msg i=\"0\" role=\"user\""));
        assert!(text.contains("a <\\/msg> trick"));
        assert!(text.contains("<msg i=\"1\" role=\"assistant\""));
        assert_eq!(unescape("a <\\/msg> trick"), "a </msg> trick");
    }

    #[test]
    fn requests_are_cacheable_and_schema_constrained() {
        let input = WindowInput {
            window_id: 7,
            conversation_title: "t".into(),
            source: "chatgpt".into(),
            context: vec![],
            parts: vec![part(2, "user", "x")],
        };

        let body = serde_json::to_value(build_request(&input)).unwrap();

        assert_eq!(body["model"], "claude-haiku-4-5");
        assert_eq!(body["system"][0]["cache_control"]["type"], "ephemeral");
        assert_eq!(body["output_config"]["format"]["type"], "json_schema");
        assert!(body.get("thinking").is_none());
        assert!(body.get("temperature").is_none());
        assert_eq!(window_id_from_custom_id(&custom_id(7)), Some(7));
        assert_eq!(window_id_from_custom_id("other-7"), None);
    }
}
