use super::*;

fn msg(seq: i64, chars: usize) -> WindowMessage {
    WindowMessage {
        message_id: 100 + seq,
        seq,
        role: if seq % 2 == 0 { "user" } else { "assistant" }.into(),
        text: "x".repeat(chars),
        created_at: format!("2026-01-01T00:00:{seq:02}.000000Z"),
    }
}

fn existing(w: &PlannedWindow) -> ExistingWindow {
    ExistingWindow {
        first_seq: w.first_seq,
        last_seq: w.last_seq,
        part_index: w.part_index,
        part_count: w.part_count,
        hash: w.hash.clone(),
    }
}

#[test]
fn a_short_conversation_is_one_window_without_context() {
    let messages = vec![msg(0, 100), msg(1, 200)];

    let windows = plan(&messages, &[]);

    assert_eq!(windows.len(), 1);
    assert_eq!((windows[0].first_seq, windows[0].last_seq), (0, 1));
    assert!(windows[0].context.is_empty());
}

#[test]
fn long_conversations_split_at_the_budget_with_overlap_context() {
    let third = budget_chars() / 3 + 1;
    let messages: Vec<_> = (0..7).map(|s| msg(s, third)).collect();

    let windows = plan(&messages, &[]);

    assert_eq!(windows.len(), 4);
    assert!(windows.iter().all(|w| w.parts.len() <= 2));
    let context_chars: usize = windows[1].context.iter().map(|p| p.text.len()).sum();
    assert!(context_chars <= OVERLAP_MAX_CHARS);
    assert_eq!(windows[1].context.last().unwrap().seq, windows[0].last_seq);
}

#[test]
fn an_oversize_message_is_split_into_its_own_part_windows() {
    let messages = vec![msg(0, 50), msg(1, budget_chars() * 2 + 10), msg(2, 50)];

    let windows = plan(&messages, &[]);

    let split: Vec<_> = windows.iter().filter(|w| w.part_count > 1).collect();
    assert_eq!(split.len(), 3);
    assert_eq!(
        split.iter().map(|w| w.part_index).collect::<Vec<_>>(),
        [0, 1, 2]
    );
    let total: usize = split.iter().map(|w| w.parts[0].text.len()).sum();
    assert_eq!(
        total,
        budget_chars() * 2 + 10,
        "no characters are lost when splitting"
    );
    assert_eq!(windows.last().unwrap().first_seq, 2);
}

#[test]
fn split_text_prefers_paragraph_breaks() {
    let text = format!("{}\n\n{}", "a".repeat(80), "b".repeat(80));

    let chunks = split_text(&text, 100);

    assert_eq!(chunks[0], format!("{}\n\n", "a".repeat(80)));
    assert_eq!(chunks.concat(), text);
}

#[test]
fn appending_messages_keeps_earlier_windows_valid() {
    let half = budget_chars() / 2 + 1;
    let v1: Vec<_> = (0..4).map(|s| msg(s, half)).collect();
    let first = plan(&v1, &[]);
    let mut v2 = v1.clone();
    v2.push(msg(4, 100));

    let kept = valid_prefix(&first.iter().map(existing).collect::<Vec<_>>(), &v2);

    assert_eq!(kept, first.len());
    let lead_in = tail_parts(&v2, first.last().unwrap().last_seq);
    let fresh = plan(&v2[4..], &lead_in);
    assert_eq!(fresh.len(), 1);
    assert_eq!(fresh[0].first_seq, 4);
    assert!(!fresh[0].context.is_empty());
}

#[test]
fn an_edited_message_invalidates_its_window_and_everything_after() {
    let half = budget_chars() / 2 + 1;
    let v1: Vec<_> = (0..6).map(|s| msg(s, half)).collect();
    let windows = plan(&v1, &[]);
    let mut v2 = v1.clone();
    v2[3].text.push('!');

    let kept = valid_prefix(&windows.iter().map(existing).collect::<Vec<_>>(), &v2);

    let edited = windows
        .iter()
        .position(|w| w.first_seq <= 3 && w.last_seq >= 3)
        .unwrap();
    assert_eq!(kept, edited);
}
