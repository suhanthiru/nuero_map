//! `[[wikilinks]]` in a note, found with the same rules as the frontend's `linkWikilinks`
//! (`src/features/topic/model/note.ts`): fenced code and inline code spans are skipped,
//! `[[target]]`, `[[target|shown]]` and `![[embed]]` all count.

/// One `[[link]]`: its raw target (trimmed, may hold a `#heading` part) and where it sits.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Wikilink {
    pub target: String,
    /// 1-based line in the note.
    pub line: i64,
}

/// One line of a note, with the byte spans a plain-text mention must not fall inside.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ScannedLine<'a> {
    /// 1-based line number.
    pub line: i64,
    pub text: &'a str,
    /// The line is inside (or opens/closes) a fenced code block.
    pub in_code: bool,
    /// Byte ranges of `[[links]]` and inline code spans on the line.
    pub protected: Vec<(usize, usize)>,
    pub links: Vec<String>,
}

/// `^ {0,3}` then a run of 3+ of `mark`; returns the run length and what follows it.
fn fence_run(line: &str) -> Option<(char, usize, &str)> {
    let spaces = line.len() - line.trim_start_matches(' ').len();
    if spaces > 3 {
        return None;
    }
    let rest = &line[spaces..];
    let mark = rest.chars().next().filter(|c| *c == '`' || *c == '~')?;
    let run = rest.len() - rest.trim_start_matches(mark).len();
    (run >= 3).then(|| (mark, run, &rest[run..]))
}

/// A backtick fence can't have a backtick in its info string (so ```code``` isn't one).
fn opens_fence(line: &str) -> Option<(char, usize)> {
    let (mark, run, rest) = fence_run(line)?;
    (mark == '~' || !rest.contains('`')).then_some((mark, run))
}

fn closes_fence(line: &str, open: (char, usize)) -> bool {
    matches!(fence_run(line), Some((mark, run, rest))
        if mark == open.0 && run >= open.1 && rest.chars().all(char::is_whitespace))
}

/// End of an inline code span starting at `i` (a backtick), matching the frontend's
/// `` (`+)[^`]*?\1 `` including its backtracking: a run of `r` backticks closes at the
/// next backtick run that is at least `r` long.
fn code_span_end(b: &[u8], i: usize) -> Option<usize> {
    let run = b[i..].iter().take_while(|&&c| c == b'`').count();
    for r in (1..=run).rev() {
        let mut p = i + r;
        while p < b.len() && b[p] != b'`' {
            p += 1;
        }
        let next_run = b[p..].iter().take_while(|&&c| c == b'`').count();
        if next_run >= r {
            return Some(p + r);
        }
    }
    None
}

/// A wikilink starting at `i` (`[` or `!` then `[`): returns (end, target).
fn wikilink_at(line: &str, i: usize) -> Option<(usize, &str)> {
    let start = if line[i..].starts_with('!') { i + 1 } else { i };
    let rest = line[start..].strip_prefix("[[")?;
    let open = start + 2;
    let target_len = rest.find(['[', ']', '|', '\n']).unwrap_or(rest.len());
    if target_len == 0 {
        return None;
    }
    let after_target = &rest[target_len..];
    let close_from = if let Some(shown) = after_target.strip_prefix('|') {
        let shown_len = shown.find(['[', ']', '\n']).unwrap_or(shown.len());
        if shown_len == 0 {
            return None;
        }
        open + target_len + 1 + shown_len
    } else {
        open + target_len
    };
    line[close_from..]
        .starts_with("]]")
        .then(|| (close_from + 2, &rest[..target_len]))
}

/// Links and protected spans on one line outside fenced code, scanned left to right the
/// way a global regex would: a code span or a link consumes its text, else move one char.
fn scan_inline(line: &str) -> (Vec<(usize, usize)>, Vec<String>) {
    let b = line.as_bytes();
    let mut protected = Vec::new();
    let mut links = Vec::new();
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'`' {
            if let Some(end) = code_span_end(b, i) {
                protected.push((i, end));
                i = end;
                continue;
            }
        } else if b[i] == b'[' || b[i] == b'!' {
            if let Some((end, target)) = wikilink_at(line, i) {
                protected.push((i, end));
                links.push(target.trim().to_string());
                i = end;
                continue;
            }
        }
        i += line[i..].chars().next().map_or(1, char::len_utf8);
    }
    (protected, links)
}

/// Every line of `body` (split on `\n`), with its code state, protected spans and links.
pub fn scan(body: &str) -> Vec<ScannedLine<'_>> {
    let mut fence: Option<(char, usize)> = None;
    body.split('\n')
        .enumerate()
        .map(|(index, text)| {
            let line = index as i64 + 1;
            let in_code = match fence {
                None => {
                    fence = opens_fence(text);
                    fence.is_some()
                }
                Some(open) => {
                    if closes_fence(text, open) {
                        fence = None;
                    }
                    true
                }
            };
            let (protected, links) = if in_code {
                (Vec::new(), Vec::new())
            } else {
                scan_inline(text)
            };
            ScannedLine {
                line,
                text,
                in_code,
                protected,
                links,
            }
        })
        .collect()
}

/// Every `[[link]]` in the note, in order. Empty targets never count.
pub fn parse(body: &str) -> Vec<Wikilink> {
    scan(body)
        .into_iter()
        .flat_map(|l| {
            l.links
                .into_iter()
                .filter(|t| !t.is_empty())
                .map(move |target| Wikilink {
                    target,
                    line: l.line,
                })
        })
        .collect()
}

/// The part of a target before its first `#` (a heading link), if that differs.
pub fn base_target(target: &str) -> Option<&str> {
    let base = target.split('#').next().unwrap_or("").trim();
    (base != target && !base.is_empty()).then_some(base)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn targets(body: &str) -> Vec<(String, i64)> {
        parse(body)
            .into_iter()
            .map(|l| (l.target, l.line))
            .collect()
    }

    #[test]
    fn finds_plain_aliased_and_embedded_links_with_their_lines() {
        let body =
            "See [[Decay scoring]] and [[Thinking in Systems| systems ]].\n\n![[Photo]] [[ C# ]]";

        assert_eq!(
            targets(body),
            vec![
                ("Decay scoring".into(), 1),
                ("Thinking in Systems".into(), 1),
                ("Photo".into(), 3),
                ("C#".into(), 3),
            ]
        );
    }

    #[test]
    fn skips_code_spans_and_fenced_blocks() {
        let body = "`[[not]]` [[Yes]]\n```\n[[code]]\n```\n~~~~\n[[tilde]]\n~~~\n[[still code]]\n~~~~\n[[After]]";

        assert_eq!(targets(body), vec![("Yes".into(), 1), ("After".into(), 10)]);
    }

    #[test]
    fn a_one_line_fence_or_an_info_string_inside_a_fence_changes_nothing() {
        let body = "```inline``` [[A]]\n```\n```js\n[[B]]\n```\n[[C]]";

        assert_eq!(targets(body), vec![("A".into(), 1), ("C".into(), 6)]);
    }

    #[test]
    fn rejects_malformed_links_and_follows_regex_backtracking_for_code() {
        assert!(parse("[[]] [[a|]] [[a [[b]] c]] [x]]")
            .iter()
            .all(|l| l.target == "b"));
        // `` `` `` is an empty code span, so the link after it still counts.
        assert_eq!(targets("`` [[Live]]"), vec![("Live".into(), 1)]);
        assert_eq!(targets("`a [[Open]]"), vec![("Open".into(), 1)]);
        assert!(parse("    ```\n[[Indented fence is not a fence]]").len() == 1);
    }

    #[test]
    fn records_protected_spans_for_mention_matching() {
        let lines = scan("x [[Rust]] `code` y");

        assert_eq!(lines[0].protected, vec![(2, 10), (11, 17)]);
        assert!(!lines[0].in_code);
    }

    #[test]
    fn base_target_drops_a_heading_part() {
        assert_eq!(base_target("Rust#Async"), Some("Rust"));
        assert_eq!(base_target("Plain"), None);
        assert_eq!(base_target("#Only heading"), None);
    }
}
