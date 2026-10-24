use super::*;

fn at(secs: i64) -> DateTime<Utc> {
    DateTime::from_timestamp(1_800_000_000 + secs, 0).unwrap()
}

fn now() -> DateTime<Utc> {
    at(10_000)
}

fn turn(role: Role, text: &str, secs: i64) -> Turn {
    Turn {
        role,
        text: text.into(),
        captured_at: at(secs),
    }
}

/// Alternating user/model turns, captured one second apart.
fn chat(texts: &[&str]) -> Vec<Turn> {
    texts
        .iter()
        .enumerate()
        .map(|(i, t)| {
            let role = if i % 2 == 0 { Role::User } else { Role::Assistant };
            turn(role, t, i as i64)
        })
        .collect()
}

fn texts(m: &Merged) -> Vec<&str> {
    m.messages.iter().map(|x| x.text.as_str()).collect()
}

fn ids(m: &[NormalizedMessage]) -> Vec<String> {
    m.iter().map(|x| x.source_msg_id.clone()).collect()
}

fn first(snapshot: &[Turn]) -> Vec<NormalizedMessage> {
    merge(&[], snapshot, false, now()).messages
}

#[test]
fn a_first_capture_numbers_from_seq_base_with_chained_ids() {
    let m = merge(&[], &chat(&["hi", "hello"]), false, now());

    assert_eq!(texts(&m), ["hi", "hello"]);
    let seqs: Vec<u32> = m.messages.iter().map(|x| x.seq).collect();
    assert_eq!(seqs, [SEQ_BASE as u32, SEQ_BASE as u32 + 1]);
    assert_eq!(m.messages[0].source_msg_id.len(), 32);
    assert_ne!(m.messages[0].source_msg_id, m.messages[1].source_msg_id);
    assert!(!m.branch_changed && !m.renumbered);
}

#[test]
fn resending_the_same_snapshot_changes_nothing() {
    let stored = first(&chat(&["a b", "c d", "e f"]));

    let m = merge(&stored, &chat(&["a b", "c d", "e f"]), false, now());

    assert_eq!(m.messages, stored);
    assert!(!m.branch_changed);
}

#[test]
fn appending_keeps_stored_ids_seqs_and_times() {
    let stored = first(&chat(&["one", "two"]));

    let m = merge(&stored, &chat(&["one", "two", "three", "four"]), false, now());

    assert_eq!(&m.messages[..2], &stored[..]);
    assert_eq!(texts(&m), ["one", "two", "three", "four"]);
    assert_eq!(m.messages[2].seq, stored[1].seq + 1);
    assert!(!m.branch_changed);
}

#[test]
fn a_snapshot_that_stops_early_never_truncates() {
    let stored = first(&chat(&["t1", "t2", "t3", "t4", "t5", "t6"]));

    let m = merge(&stored, &chat(&["t1", "t2", "t3"]), false, now());

    assert_eq!(m.messages, stored);
}

#[test]
fn a_stale_snapshot_after_a_newer_one_changes_nothing() {
    let older = chat(&["t1", "t2"]);
    let newer = chat(&["t1", "t2", "t3", "t4"]);
    let stored = first(&newer);

    assert_eq!(merge(&stored, &older, false, now()).messages, stored);
    let grown = merge(&first(&older), &newer, false, now());
    assert_eq!(texts(&grown), ["t1", "t2", "t3", "t4"]);
}

#[test]
fn a_regenerated_reply_replaces_only_that_turn() {
    let stored = first(&chat(&["q1", "a1", "q2", "a2"]));

    let m = merge(&stored, &chat(&["q1", "a1", "q2", "a2 again"]), false, now());

    assert_eq!(texts(&m), ["q1", "a1", "q2", "a2 again"]);
    assert_eq!(ids(&m.messages[..3]), ids(&stored[..3]));
    assert_ne!(m.messages[3].source_msg_id, stored[3].source_msg_id);
    assert!(m.branch_changed);
}

#[test]
fn a_prompt_is_kept_while_its_reply_is_still_generating() {
    let stored = first(&chat(&["q1", "a1"]));

    let waiting = merge(&stored, &chat(&["q1", "a1", "q2"]), false, now());
    let done = merge(&waiting.messages, &chat(&["q1", "a1", "q2", "a2"]), false, now());

    assert_eq!(texts(&waiting), ["q1", "a1", "q2"]);
    assert_eq!(texts(&done), ["q1", "a1", "q2", "a2"]);
    assert_eq!(done.messages[2], waiting.messages[2]);
    assert!(!done.branch_changed);
}

#[test]
fn an_edited_prompt_branches_at_the_edit() {
    let stored = first(&chat(&["q1", "a1", "q2", "a2", "q3", "a3"]));

    let m = merge(&stored, &chat(&["q1", "a1", "q2 edited"]), false, now());

    assert_eq!(texts(&m), ["q1", "a1", "q2 edited"]);
    assert_eq!(ids(&m.messages[..2]), ids(&stored[..2]));
    assert!(m.branch_changed);
}

#[test]
fn repeated_short_turns_pick_the_longest_agreeing_run() {
    let stored = first(&chat(&["hi", "Hello", "thanks", "welcome", "hi", "Hello"]));

    let m = merge(&stored, &chat(&["hi", "Hello", "thanks", "welcome", "hey"]), false, now());

    assert_eq!(texts(&m), ["hi", "Hello", "thanks", "welcome", "hey"]);
    assert!(m.branch_changed);
}

#[test]
fn switching_back_to_an_earlier_draft_revives_its_id() {
    let original = first(&chat(&["q", "draft one"]));
    let switched = merge(&original, &chat(&["q", "draft two"]), false, now()).messages;

    let back = merge(&switched, &chat(&["q", "draft one"]), false, now()).messages;

    assert_eq!(back[1].source_msg_id, original[1].source_msg_id);
}

#[test]
fn older_turns_that_load_are_prepended_below_existing_seqs() {
    let stored = first(&chat(&["t3", "t4", "t5"]));
    let full = chat(&["t1", "t2", "t3", "t4", "t5"]);

    let m = merge(&stored, &full, false, now());

    assert_eq!(texts(&m), ["t1", "t2", "t3", "t4", "t5"]);
    assert_eq!(&m.messages[2..], &stored[..], "stored rows untouched");
    assert_eq!(m.messages[1].seq + 1, stored[0].seq);
    assert_eq!(m.messages[0].created_at, stored[0].created_at);
    assert!(!m.branch_changed && !m.renumbered);
}

#[test]
fn a_snapshot_can_prepend_and_append_at_once() {
    let stored = first(&chat(&["t3", "t4"]));

    let m = merge(&stored, &chat(&["t1", "t2", "t3", "t4", "t5", "t6"]), false, now());

    assert_eq!(texts(&m), ["t1", "t2", "t3", "t4", "t5", "t6"]);
    assert_eq!(&m.messages[2..4], &stored[..]);
}

#[test]
fn no_overlap_appends_after_a_marked_gap() {
    let stored = first(&chat(&["t1", "t2"]));

    let m = merge(&stored, &chat(&["t80", "t81"]), false, now());

    assert_eq!(texts(&m), ["t1", "t2", "t80", "t81"]);
    assert_eq!(m.messages[2].seq, stored[1].seq + GAP_STRIDE as u32);
    assert!(!m.branch_changed);
}

#[test]
fn no_overlap_from_the_start_of_the_chat_replaces_it() {
    let stored = first(&chat(&["old prompt", "old reply"]));

    let m = merge(&stored, &chat(&["new prompt", "new reply"]), true, now());

    assert_eq!(texts(&m), ["new prompt", "new reply"]);
    assert!(m.branch_changed);
}

#[test]
fn unmatched_turns_before_a_match_further_in_are_ignored() {
    let stored = first(&chat(&["t1", "t2", "t3", "t4"]));

    let snapshot = [
        turn(Role::Assistant, "t2 rendered oddly", 1),
        turn(Role::User, "t3", 2),
        turn(Role::Assistant, "t4", 3),
    ];

    let m = merge(&stored, &snapshot, false, now());

    assert_eq!(m.messages, stored, "rendering drift ignored");
}

#[test]
fn identical_texts_at_different_positions_get_distinct_ids() {
    let m = merge(&[], &chat(&["yes", "ok", "yes", "ok"]), false, now());

    let unique: HashSet<_> = m.messages.iter().map(|x| &x.source_msg_id).collect();
    assert_eq!(unique.len(), 4);
}

#[test]
fn cosmetic_differences_keep_the_stored_text() {
    let stored = first(&chat(&["Use `cargo test`.", "Done!"]));

    let m = merge(&stored, &chat(&["use cargo test", "  Done  "]), false, now());

    assert_eq!(m.messages, stored);
}

#[test]
fn times_never_go_backwards_and_never_run_ahead() {
    let stored = first(&[turn(Role::User, "q", 500)]);
    let snapshot = [
        turn(Role::User, "q", 500),
        turn(Role::Assistant, "earlier clock", 100),
        turn(Role::User, "future clock", 999_999),
    ];

    let m = merge(&stored, &snapshot, false, now());

    assert_eq!(m.messages[1].created_at, at(500));
    assert_eq!(m.messages[2].created_at, now() + Duration::seconds(CLOCK_SKEW_SECS));
}

#[test]
fn no_room_to_prepend_renumbers_everything() {
    let mut stored = first(&chat(&["t3", "t4"]));
    stored[0].seq = 1;
    stored[1].seq = 2;

    let m = merge(&stored, &chat(&["t1", "t2", "t3", "t4"]), false, now());

    assert!(m.renumbered);
    let seqs: Vec<u32> = m.messages.iter().map(|x| x.seq).collect();
    assert_eq!(seqs, (0..4).map(|i| SEQ_BASE as u32 + i).collect::<Vec<_>>());
}

#[test]
fn an_empty_snapshot_changes_nothing() {
    let stored = first(&chat(&["a", "b"]));

    let m = merge(&stored, &[turn(Role::User, "   ", 0)], false, now());

    assert_eq!(m.messages, stored);
}
