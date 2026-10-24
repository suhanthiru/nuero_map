use super::*;
use crate::db::Db;

fn with_db<T>(f: impl FnOnce(&Connection) -> AppResult<T>) -> T {
    let db = Db::open_in_memory().unwrap();
    db.call_blocking(|c| f(c)).unwrap()
}

fn id(raw: &str) -> i64 {
    raw.parse().unwrap()
}

#[test]
fn untitled_notes_and_folders_number_themselves_per_folder() {
    let (folders, notes, elsewhere) = with_db(|c| {
        let a = create_folder(c, None, None)?;
        let b = create_folder(c, None, None)?;
        let inner = create_folder(c, Some(id(&a.id)), None)?;
        let n1 = create_note(c, None, None, "")?;
        let n2 = create_note(c, None, None, "")?;
        let n3 = create_note(c, Some(id(&a.id)), None, "")?;
        Ok((
            vec![a.name, b.name, inner.name],
            vec![n1.summary.title, n2.summary.title],
            n3.summary.title,
        ))
    });

    assert_eq!(folders, vec!["Untitled", "Untitled 1", "Untitled"]);
    assert_eq!(notes, vec!["Untitled", "Untitled 1"]);
    assert_eq!(elsewhere, "Untitled");
}

#[test]
fn names_clash_ignoring_case_but_a_rename_can_change_case() {
    let (clash, recased, note_clash, shared) = with_db(|c| {
        let work = create_folder(c, None, Some("Work"))?;
        let clash = create_folder(c, None, Some("  work ")).unwrap_err().code();
        let recased = rename_folder(c, id(&work.id), "WORK")?.name;
        create_note(c, None, Some("Plan"), "")?;
        let other = create_note(c, None, Some("Other"), "")?;
        let note_clash = rename_note(c, id(&other.summary.id), "plan").unwrap_err().code();
        // A note may share a folder's name.
        let shared = create_note(c, None, Some("Work"), "")?.summary.title;
        Ok((clash, recased, note_clash, shared))
    });

    assert_eq!(clash, "conflict");
    assert_eq!(recased, "WORK");
    assert_eq!(note_clash, "conflict");
    assert_eq!(shared, "Work");
}

#[test]
fn refuses_bad_names_and_unknown_folders() {
    let (bad, missing, missing_parent) = with_db(|c| {
        Ok((
            create_folder(c, None, Some("a/b")).unwrap_err().code(),
            rename_note(c, 404, "x").unwrap_err().code(),
            create_note(c, Some(404), None, "").unwrap_err().code(),
        ))
    });

    assert_eq!(bad, "invalid_input");
    assert_eq!(missing, "not_found");
    assert_eq!(missing_parent, "not_found");
}

#[test]
fn a_folder_cannot_move_into_itself_or_below_itself() {
    let (into_self, into_child, moved, clash) = with_db(|c| {
        let a = create_folder(c, None, Some("A"))?;
        let b = create_folder(c, Some(id(&a.id)), Some("B"))?;
        let c2 = create_folder(c, None, Some("C"))?;
        let into_self = move_folder(c, id(&a.id), Some(id(&a.id))).unwrap_err().code();
        let into_child = move_folder(c, id(&a.id), Some(id(&b.id))).unwrap_err().code();
        let moved = move_folder(c, id(&b.id), None)?;
        create_folder(c, Some(id(&c2.id)), Some("b"))?;
        let clash = move_folder(c, id(&b.id), Some(id(&c2.id))).unwrap_err().code();
        Ok((into_self, into_child, moved.parent_id, clash))
    });

    assert_eq!(into_self, "invalid_input");
    assert_eq!(into_child, "invalid_input");
    assert_eq!(moved, None);
    assert_eq!(clash, "conflict");
}

#[test]
fn moving_a_note_checks_the_destination_for_its_title() {
    let (moved, clash) = with_db(|c| {
        let work = create_folder(c, None, Some("Work"))?;
        let plan = create_note(c, None, Some("Plan"), "x")?;
        let moved = move_note(c, id(&plan.summary.id), Some(id(&work.id)))?;
        create_note(c, None, Some("plan"), "y")?;
        let back = move_note(c, id(&plan.summary.id), None).unwrap_err().code();
        Ok((moved.folder_id, back))
    });

    assert!(moved.is_some());
    assert_eq!(clash, "conflict");
}

#[test]
fn deleting_a_folder_returns_the_notes_that_went_with_it() {
    let (gone, tree) = with_db(|c| {
        let top = create_folder(c, None, Some("Top"))?;
        let sub = create_folder(c, Some(id(&top.id)), Some("Sub"))?;
        let a = create_note(c, Some(id(&top.id)), Some("A"), "")?;
        let b = create_note(c, Some(id(&sub.id)), Some("B"), "")?;
        create_note(c, None, Some("Kept"), "")?;
        let gone = delete_folder(c, id(&top.id))?;
        assert_eq!(gone, vec![a.summary.id, b.summary.id]);
        Ok((gone.len(), tree(c)?))
    });

    assert_eq!(gone, 2);
    assert!(tree.folders.is_empty());
    assert_eq!(tree.notes.len(), 1);
    assert_eq!(tree.notes[0].title, "Kept");
}

#[test]
fn an_empty_body_keeps_the_note_and_saving_bumps_its_time() {
    let (saved, created) = with_db(|c| {
        let note = create_note(c, None, Some("Draft"), "first")?;
        std::thread::sleep(std::time::Duration::from_millis(2));
        let saved = save_note(c, id(&note.summary.id), "")?;
        Ok((saved, note))
    });

    assert_eq!(saved.body, "");
    assert_eq!(saved.summary.created_at, created.summary.created_at);
    assert!(saved.summary.updated_at > created.summary.updated_at);
}

#[test]
fn notes_have_the_note_limit_and_serialize_in_camel_case() {
    let (too_long, json) = with_db(|c| {
        let too_long = create_note(c, None, None, &"a".repeat(NOTE_MAX_CHARS + 1))
            .unwrap_err()
            .code();
        let folder = create_folder(c, None, Some("F"))?;
        let note = create_note(c, Some(id(&folder.id)), Some("N"), "body")?;
        Ok((too_long, serde_json::to_value(&note).unwrap()))
    });

    assert_eq!(too_long, "invalid_input");
    for key in ["id", "folderId", "title", "createdAt", "updatedAt", "source", "body"] {
        assert!(json.get(key).is_some(), "{key} missing from {json}");
    }
    assert_eq!(json["source"], serde_json::Value::Null);
    assert!(json["folderId"].is_string());
}
