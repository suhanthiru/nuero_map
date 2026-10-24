mod common;

use std::sync::Arc;

use chrono::Utc;
use neural_map_lib::commands::import::queue_import;
use neural_map_lib::db::Db;
use neural_map_lib::embed::fake::FakeEmbedder;
use neural_map_lib::events::RecordingSink;
use neural_map_lib::graph::{shelf, view};
use neural_map_lib::ingest::detect::RequestedSource;
use neural_map_lib::jobs::handlers::JobContext;
use neural_map_lib::jobs::worker::Worker;
use neural_map_lib::jobs::{JobHandle, JobPayload};
use neural_map_lib::llm::fake::FakeLlm;
use neural_map_lib::llm::types::MessageRequest;
use neural_map_lib::secrets::MemoryStore;
use neural_map_lib::topics::{page, search};
use serde_json::json;

// Checked in order: a message mentioning decay belongs to the neural map even if it also names the robot.
const LABELS: &[(&str, &str)] = &[
    ("decay", "Neural map app"),
    ("robot", "Robot arm project"),
    ("sleep", "Sleep routine"),
];

fn label_for(text: &str) -> Option<&'static str> {
    LABELS
        .iter()
        .find(|(k, _)| text.to_lowercase().contains(k))
        .map(|(_, l)| *l)
}

/// One idea per window message that mentions a known keyword; "ties into" links it to
/// the previous idea (an explicit relation).
fn responder(req: &MessageRequest) -> neural_map_lib::error::AppResult<String> {
    let transcript = req.messages[0].content.as_str().unwrap_or_default();
    let mut ideas = Vec::new();
    for (i, chunk) in transcript.split("<msg i=\"").skip(1).enumerate() {
        let body = chunk
            .split_once('>')
            .map(|(_, b)| b)
            .unwrap_or("")
            .split("</msg>")
            .next()
            .unwrap_or("");
        let Some(label) = label_for(body) else {
            continue;
        };
        let related: Vec<usize> = if body.contains("ties into") && !ideas.is_empty() {
            vec![ideas.len() - 1]
        } else {
            vec![]
        };
        ideas.push(json!({
            "title": format!("About {label}"), "summary": body, "kind": "insight", "topic_label": label,
            "topic_aliases": [], "source_message_indices": [i], "excerpt": body.chars().take(40).collect::<String>(),
            "is_user_originated": true, "gem_candidate": false, "related_idea_indices": related
        }));
    }
    Ok(json!({ "ideas": ideas }).to_string())
}

fn export() -> String {
    let now = Utc::now();
    let at = |days: i64| (now - chrono::Duration::days(days)).to_rfc3339();
    let conv = |id: &str, days: i64, msgs: &[&str]| {
        let messages: Vec<_> = msgs
            .iter()
            .enumerate()
            .map(|(i, t)| json!({"uuid": format!("{id}-m{i}"), "sender": if i % 2 == 0 {"human"} else {"assistant"}, "text": t, "created_at": at(days)}))
            .collect();
        json!({"uuid": id, "name": id, "created_at": at(days), "updated_at": at(days), "chat_messages": messages})
    };
    json!([
        conv(
            "c1",
            2,
            &[
                "The robot arm wrist jitters.",
                "Decay should key off message time; this ties into the robot logging idea."
            ]
        ),
        conv(
            "c2",
            1,
            &["More on decay half-life for the neural map.", "ok"]
        ),
        conv(
            "c3",
            40,
            &["Robot arm IK this weekend.", "My sleep routine is off."]
        ),
    ])
    .to_string()
}

fn imported() -> Db {
    let dir = tempfile::tempdir().unwrap();
    let zip = common::make_zip(
        dir.path(),
        "e.zip",
        &[("conversations.json", &export()), ("users.json", "[]")],
    );
    let db = Db::open_in_memory().unwrap();
    let ctx = JobContext {
        db: db.clone(),
        sink: Arc::new(RecordingSink::default()),
        llm: Arc::new(FakeLlm::new(responder)),
        keys: Arc::new(MemoryStore::with_key("sk-ant-test")),
        embedder: Arc::new(FakeEmbedder),
    };
    let jobs = JobHandle::default();
    let payload = JobPayload::Import {
        path: zip.display().to_string(),
        source: RequestedSource::Auto,
        expected_conversations: None,
    };
    queue_import(&db, &jobs, payload).unwrap();
    Worker::new(ctx, jobs).drain().unwrap();
    db
}

fn topic_id(db: &Db, name: &'static str) -> i64 {
    db.call_blocking(move |c| {
        Ok(
            c.query_row("select id from topics where name = ?1", [name], |r| {
                r.get(0)
            })?,
        )
    })
    .unwrap()
}

#[test]
fn groups_ideas_by_label_and_connects_topics_that_met() {
    let db = imported();
    let robot = topic_id(&db, "Robot arm project");
    let neural = topic_id(&db, "Neural map app");
    let sleep = topic_id(&db, "Sleep routine");

    let graph = db.call_blocking(|c| view::graph(c, false, false)).unwrap();
    let json = serde_json::to_value(&graph).unwrap();

    assert_eq!(graph.nodes.len(), 3);
    let node = &json["nodes"]
        .as_array()
        .unwrap()
        .iter()
        .find(|n| n["id"] == *robot.to_string())
        .unwrap()
        .clone();
    assert_eq!(node["ideaCount"], 2);
    assert!(node["decay"].as_f64().unwrap() > 0.0);
    assert!(
        node.get("recentlyLinked").is_some() && node.get("lastActiveAt").is_some(),
        "camelCase contract keys"
    );
    let kind = |a: i64, b: i64| {
        graph
            .edges
            .iter()
            .find(|e| {
                let (s, t) = (
                    e.source.parse::<i64>().unwrap(),
                    e.target.parse::<i64>().unwrap(),
                );
                (s, t) == (a.min(b), a.max(b))
            })
            .map(|e| e.kind.clone())
    };
    assert_eq!(
        kind(robot, neural).as_deref(),
        Some("explicit"),
        "\"ties into\" made an explicit link"
    );
    assert_eq!(kind(robot, sleep).as_deref(), Some("cooccurrence"));
    assert_eq!(kind(neural, sleep), None);
}

#[test]
fn edge_evidence_and_topic_page_carry_attributed_excerpts() {
    let db = imported();
    let robot = topic_id(&db, "Robot arm project");
    let edge_id: i64 = db
        .call_blocking(|c| {
            Ok(
                c.query_row("select id from edges where kind = 'explicit'", [], |r| {
                    r.get(0)
                })?,
            )
        })
        .unwrap();

    let evidence = db
        .call_blocking(|c| view::edge_evidence(c, edge_id))
        .unwrap();
    let topic_page = db.call_blocking(|c| page::topic_page(c, robot)).unwrap();

    assert!(evidence.excerpts.len() >= 2);
    assert!(evidence.excerpts.iter().all(|x| x.source.app == "claude"));
    assert_eq!(topic_page.ideas.len(), 2);
    assert_eq!(topic_page.connections.len(), 2);
    assert!(topic_page
        .connections
        .iter()
        .all(|c| !c.evidence.is_empty()));
    assert!(topic_page.current.is_none(), "summaries arrive in Phase 6");
}

#[test]
fn shelf_search_state_and_pins_work_on_real_topics() {
    let db = imported();
    let robot = topic_id(&db, "Robot arm project");
    let sleep = topic_id(&db, "Sleep routine");
    db.call_blocking(|c| neural_map_lib::db::repo::topics::set_state(c, sleep, "parked", None))
        .unwrap();

    let today = db
        .call_blocking(|c| shelf::today(c, Utc::now(), 14.0))
        .unwrap();
    let again = db
        .call_blocking(|c| shelf::today(c, Utc::now(), 14.0))
        .unwrap();
    let hits = db
        .call_blocking(|c| search::search(c, "robot", 10))
        .unwrap();
    let idea: i64 = db
        .call_blocking(move |c| {
            Ok(c.query_row(
                "select id from ideas where topic_id = ?1 limit 1",
                [robot],
                |r| r.get(0),
            )?)
        })
        .unwrap();
    let gem = db.call_blocking(|c| page::pin_gem(c, robot, idea)).unwrap();
    let pinned_twice = db.call_blocking(|c| page::pin_gem(c, robot, idea)).unwrap();

    let reasons: Vec<&str> = today.cards.iter().map(|c| c.reason.as_str()).collect();
    assert!(reasons.contains(&"parked"));
    assert!(reasons.contains(&"newConnection"));
    assert_eq!(
        serde_json::to_value(&again.cards).unwrap(),
        serde_json::to_value(&today.cards).unwrap(),
        "stable for the day"
    );
    assert_eq!(hits[0].kind, "topic");
    assert_eq!(hits[0].title, "Robot arm project");
    assert_eq!(gem.id, pinned_twice.id, "pinning is idempotent");
}
