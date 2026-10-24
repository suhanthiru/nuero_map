use sha2::{Digest, Sha256};

use super::model::NormalizedConversation;

const FIELD_SEP: u8 = 0x1f;
const RECORD_SEP: u8 = 0x1e;

/// Hash of the active branch (ids, roles, text). Title renames don't change it.
pub fn content_hash(conv: &NormalizedConversation) -> String {
    let mut hasher = Sha256::new();
    for m in &conv.messages {
        hasher.update(m.source_msg_id.as_bytes());
        hasher.update([FIELD_SEP]);
        hasher.update(m.role.as_str().as_bytes());
        hasher.update([FIELD_SEP]);
        hasher.update(m.text.as_bytes());
        hasher.update([RECORD_SEP]);
    }
    hex(&hasher.finalize())
}

pub fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ingest::model::{NormalizedMessage, Role, Source};
    use chrono::DateTime;

    fn conv(title: &str, texts: &[&str]) -> NormalizedConversation {
        NormalizedConversation {
            source: Source::Claude,
            source_id: "c".into(),
            title: title.into(),
            url: None,
            created_at: DateTime::UNIX_EPOCH,
            updated_at: DateTime::UNIX_EPOCH,
            updated_marker: String::new(),
            messages: texts
                .iter()
                .enumerate()
                .map(|(i, t)| NormalizedMessage {
                    source_msg_id: format!("m{i}"),
                    role: Role::User,
                    text: (*t).into(),
                    created_at: DateTime::UNIX_EPOCH,
                    seq: i as u32,
                })
                .collect(),
        }
    }

    #[test]
    fn ignores_title_but_tracks_message_content() {
        let base = content_hash(&conv("a", &["x", "y"]));

        assert_eq!(base, content_hash(&conv("renamed", &["x", "y"])));
        assert_ne!(base, content_hash(&conv("a", &["x", "y!"])));
        assert_ne!(base, content_hash(&conv("a", &["xy"])));
        assert_eq!(base.len(), 64);
    }
}
