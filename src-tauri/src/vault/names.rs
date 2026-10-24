//! Note titles and folder names: what's allowed, and picking a free one.

use crate::config::vault::NAME_MAX_CHARS;
use crate::error::{AppError, AppResult};

/// Path separators (so notes can be written out as files later) and `[[link|syntax]]`.
/// Matches `VAULT_NAME_FORBIDDEN` on the frontend.
pub const FORBIDDEN: &[char] = &['\\', '/', '[', ']', '|'];

/// What a new note or folder is called until it's renamed.
pub const UNTITLED: &str = "Untitled";

fn collapse(raw: &str) -> String {
    raw.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn truncate(text: &str, max: usize) -> &str {
    match text.char_indices().nth(max) {
        Some((at, _)) => &text[..at],
        None => text,
    }
}

/// A name the user typed, spaces collapsed and trimmed, or why it can't be used. `what` is
/// "note" or "folder", for the message.
pub fn normalize(raw: &str, what: &str) -> AppResult<String> {
    if raw.chars().any(char::is_control) {
        return Err(AppError::InvalidInput(format!(
            "a {what} name can't contain control characters"
        )));
    }
    let name = collapse(raw);
    if name.is_empty() {
        return Err(AppError::InvalidInput(format!("a {what} needs a name")));
    }
    if name.contains(FORBIDDEN) {
        return Err(AppError::InvalidInput(format!(
            "a {what} name can't contain \\ / [ ] or |"
        )));
    }
    if name.chars().count() > NAME_MAX_CHARS {
        return Err(AppError::InvalidInput(format!(
            "a {what} name can be at most {NAME_MAX_CHARS} characters"
        )));
    }
    Ok(name)
}

/// A usable name made from anything (a file name): forbidden characters become `-`,
/// control characters spaces, and it's cut to length. Never empty.
pub fn sanitize(raw: &str) -> String {
    let replaced: String = raw
        .chars()
        .map(|c| match c {
            c if FORBIDDEN.contains(&c) => '-',
            c if c.is_control() => ' ',
            c => c,
        })
        .collect();
    let name = collapse(truncate(&collapse(&replaced), NAME_MAX_CHARS));
    if name.is_empty() {
        UNTITLED.to_string()
    } else {
        name
    }
}

/// `base` if it's free, else "base 1", "base 2"… (cutting `base` short when the number
/// would push it past the length limit).
pub fn unique(base: &str, mut taken: impl FnMut(&str) -> AppResult<bool>) -> AppResult<String> {
    if !taken(base)? {
        return Ok(base.to_string());
    }
    for n in 1u32.. {
        let suffix = format!(" {n}");
        let room = NAME_MAX_CHARS.saturating_sub(suffix.chars().count());
        let candidate = format!("{}{suffix}", truncate(base, room).trim_end());
        if !taken(&candidate)? {
            return Ok(candidate);
        }
    }
    Err(AppError::internal("ran out of names"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_and_refuses_bad_names() {
        assert_eq!(normalize("  Plan \u{a0} for   Q3 ", "note").unwrap(), "Plan for Q3");
        assert_eq!(normalize("C#", "note").unwrap(), "C#");
        for bad in ["", "   ", "a/b", "a\\b", "[[x]]", "a|b", "line\nbreak", "tab\there"] {
            assert_eq!(normalize(bad, "note").unwrap_err().code(), "invalid_input", "{bad:?}");
        }
        assert!(normalize(&"é".repeat(NAME_MAX_CHARS), "folder").is_ok());
        assert!(normalize(&"é".repeat(NAME_MAX_CHARS + 1), "folder").is_err());
    }

    #[test]
    fn sanitizes_file_names_into_titles() {
        assert_eq!(sanitize("Q1/Q2 [draft] | v2"), "Q1-Q2 -draft- - v2");
        assert_eq!(sanitize(" \u{7}\t "), UNTITLED);
        let long = sanitize(&"word ".repeat(100));
        assert!(long.chars().count() <= NAME_MAX_CHARS);
        assert!(!long.ends_with(' '));
    }

    #[test]
    fn numbers_names_until_one_is_free() {
        let taken = ["untitled", "untitled 1"];
        let pick = |base: &str| {
            unique(base, |c| Ok(taken.contains(&c.to_lowercase().as_str()))).unwrap()
        };

        assert_eq!(pick("Untitled"), "Untitled 2");
        assert_eq!(pick("Plan"), "Plan");

        let full = "x".repeat(NAME_MAX_CHARS);
        let numbered = unique(&full, |c| Ok(c == full)).unwrap();
        assert_eq!(numbered.chars().count(), NAME_MAX_CHARS);
        assert!(numbered.ends_with(" 1"));
    }
}
