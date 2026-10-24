//! Import an export into the database, or estimate what importing it would cost.

use std::cell::RefCell;
use std::collections::HashMap;
use std::path::Path;

use rusqlite::{params, Connection};
use serde::Serialize;

use super::archive::Archive;
use super::detect::{detect, Detected, ExportKind, RequestedSource};
use super::fingerprint::content_hash;
use super::model::{NormalizedConversation, ParseStats, ParseWarning, Source};
use super::{chatgpt, claude};
use crate::config::{pricing, CHARS_PER_TOKEN, IMPORT_BATCH_SIZE};
use crate::db::repo::conversations::{self, StoredFingerprint};
use crate::db::repo::messages::{self, TimeSource};
use crate::db::{now_ts, Db};
use crate::error::{AppError, AppResult};

#[derive(Debug, Default, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportReport {
    pub source: String,
    pub conversations: usize,
    pub new_conversations: usize,
    pub changed_conversations: usize,
    pub unchanged_conversations: usize,
    pub messages_added: usize,
    pub warnings: Vec<ParseWarning>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportEstimate {
    pub path: String,
    pub detected_source: String,
    pub conversations: usize,
    pub new_conversations: usize,
    pub changed_conversations: usize,
    pub messages: usize,
    pub estimated_input_tokens: u64,
    pub estimated_output_tokens: u64,
    pub estimated_cost_usd: f64,
    pub extraction_model: String,
}

fn source_of(kind: ExportKind) -> Source {
    match kind {
        ExportKind::Claude => Source::Claude,
        ExportKind::ChatGpt => Source::ChatGpt,
    }
}

/// Streams every conversations file in the export through the right parser.
/// Returns the warnings and whether `should_stop` cut parsing short.
fn parse_all(
    archive: &Archive,
    detected: &Detected,
    mut on_conversation: impl FnMut(NormalizedConversation),
    should_stop: &dyn Fn() -> bool,
) -> AppResult<(Vec<ParseWarning>, bool)> {
    let mut warnings = Vec::new();
    for file in &detected.conversation_files {
        let stats: ParseStats = archive.read_entry(file, |reader| match detected.kind {
            ExportKind::Claude => claude::parse_until(reader, &mut on_conversation, should_stop),
            ExportKind::ChatGpt => chatgpt::parse_until(reader, &mut on_conversation, should_stop),
        })?;
        warnings.extend(stats.warnings);
        if stats.stopped {
            return Ok((warnings, true));
        }
    }
    Ok((warnings, false))
}

/// Hooks for the job runner: progress after each stored batch, and cancellation.
pub trait ImportObserver {
    fn stored(&self, conversations_done: usize);
    fn should_stop(&self) -> bool;
}

struct Silent;

impl ImportObserver for Silent {
    fn stored(&self, _: usize) {}
    fn should_stop(&self) -> bool {
        false
    }
}

enum Outcome {
    New(usize),
    Changed(usize),
    Unchanged,
}

fn store(conn: &Connection, conv: &NormalizedConversation, now: &str) -> AppResult<Outcome> {
    let hash = content_hash(conv);
    match conversations::find(conn, conv.source, &conv.source_id)? {
        None => {
            let id = conversations::insert(conn, conv, &hash, now)?;
            Ok(Outcome::New(messages::sync_branch(
                conn,
                id,
                &conv.messages,
                TimeSource::Source,
            )?))
        }
        Some(s) if s.updated_marker == conv.updated_marker && s.content_hash == hash => {
            Ok(Outcome::Unchanged)
        }
        Some(s) => {
            conversations::update(conn, s.id, conv, &hash, now)?;
            Ok(Outcome::Changed(messages::sync_branch(
                conn,
                s.id,
                &conv.messages,
                TimeSource::Source,
            )?))
        }
    }
}

fn flush(
    conn: &mut Connection,
    batch: &mut Vec<NormalizedConversation>,
    report: &mut ImportReport,
) -> AppResult<()> {
    let now = now_ts();
    let tx = conn.transaction()?;
    for conv in batch.drain(..) {
        report.conversations += 1;
        match store(&tx, &conv, &now)? {
            Outcome::New(added) => {
                report.new_conversations += 1;
                report.messages_added += added;
            }
            Outcome::Changed(added) => {
                report.changed_conversations += 1;
                report.messages_added += added;
            }
            Outcome::Unchanged => report.unchanged_conversations += 1,
        }
    }
    tx.commit()?;
    Ok(())
}

fn record_run(
    conn: &Connection,
    path: &Path,
    report: &ImportReport,
    started_at: &str,
) -> AppResult<()> {
    conn.execute(
        "insert into import_runs (source, path, started_at, finished_at, report_json) values (?1, ?2, ?3, ?4, ?5)",
        params![
            report.source,
            path.display().to_string(),
            started_at,
            now_ts(),
            serde_json::to_string(report)?,
        ],
    )?;
    Ok(())
}

/// Blocking. Parses the export and upserts conversations in batched transactions.
pub fn import_export(db: &Db, path: &Path, requested: RequestedSource) -> AppResult<ImportReport> {
    import_export_observed(db, path, requested, &Silent)
}

/// Like [`import_export`], reporting progress per batch and honouring cancellation.
/// The database lock is taken per batch, never for the whole import, so the UI can
/// keep reading while a large export streams in.
pub fn import_export_observed(
    db: &Db,
    path: &Path,
    requested: RequestedSource,
    observer: &dyn ImportObserver,
) -> AppResult<ImportReport> {
    let archive = Archive::open(path)?;
    let detected = detect(&archive, requested)?;
    let started_at = now_ts();
    let mut report = ImportReport {
        source: source_of(detected.kind).as_str().to_owned(),
        ..ImportReport::default()
    };
    let mut batch = Vec::with_capacity(IMPORT_BATCH_SIZE);
    let failure: RefCell<Option<AppError>> = RefCell::new(None);
    let stop = || failure.borrow().is_some() || observer.should_stop();
    let (warnings, stopped) = parse_all(
        &archive,
        &detected,
        |conv| {
            batch.push(conv);
            if batch.len() < IMPORT_BATCH_SIZE || failure.borrow().is_some() {
                return;
            }
            match db.call_blocking(|c| flush(c, &mut batch, &mut report)) {
                Ok(()) => observer.stored(report.conversations),
                Err(e) => *failure.borrow_mut() = Some(e),
            }
        },
        &stop,
    )?;
    if let Some(err) = failure.into_inner() {
        return Err(err);
    }
    if stopped {
        return Err(AppError::Cancelled);
    }
    db.call_blocking(|c| flush(c, &mut batch, &mut report))?;
    observer.stored(report.conversations);
    report.warnings = warnings;
    db.call_blocking(|c| record_run(c, path, &report, &started_at))?;
    Ok(report)
}

#[derive(Default)]
struct Tally {
    conversations: usize,
    new: usize,
    changed: usize,
    messages: usize,
    transcript_tokens: f64,
    windows: f64,
}

fn tally(
    stored: &HashMap<String, StoredFingerprint>,
    conv: &NormalizedConversation,
    t: &mut Tally,
) {
    t.conversations += 1;
    t.messages += conv.messages.len();
    let needs_work = match stored.get(&conv.source_id) {
        None => {
            t.new += 1;
            true
        }
        Some(s)
            if s.updated_marker == conv.updated_marker && s.content_hash == content_hash(conv) =>
        {
            false
        }
        Some(_) => {
            t.changed += 1;
            true
        }
    };
    if needs_work {
        let tokens = conv.char_count() as f64 / CHARS_PER_TOKEN;
        t.transcript_tokens += tokens;
        t.windows += (tokens / pricing::WINDOW_TOKENS).ceil().max(1.0);
    }
}

/// Blocking and read-only. Counts what an import would add and prices the extraction.
pub fn estimate_export(
    db: &Db,
    path: &Path,
    requested: RequestedSource,
) -> AppResult<ImportEstimate> {
    let archive = Archive::open(path)?;
    let detected = detect(&archive, requested)?;
    let source = source_of(detected.kind);
    let stored = db.call_blocking(|c| conversations::fingerprints(c, source))?;
    let mut t = Tally::default();
    parse_all(
        &archive,
        &detected,
        |conv| tally(&stored, &conv, &mut t),
        &super::never_stop,
    )?;

    let system_tokens = t.windows * pricing::SYSTEM_PROMPT_TOKENS;
    let output_tokens = t.transcript_tokens * pricing::OUTPUT_TO_INPUT_RATIO;
    let billed_input = t.transcript_tokens + system_tokens * pricing::CACHE_READ_FACTOR;
    let cost = billed_input / 1e6 * pricing::BATCH_INPUT_PER_MTOK
        + output_tokens / 1e6 * pricing::BATCH_OUTPUT_PER_MTOK;
    Ok(ImportEstimate {
        path: path.display().to_string(),
        detected_source: source.as_str().to_owned(),
        conversations: t.conversations,
        new_conversations: t.new,
        changed_conversations: t.changed,
        messages: t.messages,
        estimated_input_tokens: (t.transcript_tokens + system_tokens).round() as u64,
        estimated_output_tokens: output_tokens.round() as u64,
        estimated_cost_usd: cost,
        extraction_model: pricing::EXTRACTION_MODEL.to_owned(),
    })
}
