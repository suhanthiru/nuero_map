//! Turning documents into notes: Word .docx (what Google Docs downloads too), markdown and
//! text files, and whole folders and zips of them (a Google Takeout zip works), keeping
//! their folder structure. Files are read first, without the database; then everything is
//! written in one transaction.

use std::fs::{self, File};
use std::io::{BufReader, Cursor, Read};
use std::path::Path;

use rusqlite::Connection;
use zip::ZipArchive;

use crate::config::topics::NOTE_MAX_CHARS;
use crate::config::vault::{MAX_DOCX_XML_BYTES, MAX_DOC_BYTES, MAX_IMPORT_FILES, MAX_TEXT_BYTES};
use crate::db::repo::vault as repo;
use crate::error::AppResult;
use crate::topics::links::link_key;

use super::docx::{self, DocxError};
use super::dto::{ImportedDocumentsDto, SkipReason, SkippedDocumentDto};
use super::names;
use super::ops;
use super::text;

/// What reading the picked paths found, before anything is written.
#[derive(Debug, Default)]
pub struct Planned {
    /// Stands for the destination folder: picked files are its notes, picked folders and
    /// zips its folders. Its own name is unused.
    pub root: PlannedFolder,
    pub skipped: Vec<SkippedDocumentDto>,
    pub ignored: usize,
}

#[derive(Debug, Default)]
pub struct PlannedFolder {
    pub name: String,
    pub folders: Vec<PlannedFolder>,
    pub notes: Vec<PlannedNote>,
}

#[derive(Debug)]
pub struct PlannedNote {
    pub title: String,
    pub body: String,
    /// The file's name, kept on the note.
    pub source: String,
    /// Where it was found, for a duplicate report.
    pub path: String,
}

impl PlannedFolder {
    fn named(raw: &str) -> Self {
        Self {
            name: names::sanitize(raw),
            ..Self::default()
        }
    }

    fn is_empty(&self) -> bool {
        self.notes.is_empty() && self.folders.is_empty()
    }

    /// The folder at `segments` below this one, made as needed (names compared by key).
    fn descend(&mut self, segments: &[String]) -> &mut PlannedFolder {
        let Some((first, rest)) = segments.split_first() else {
            return self;
        };
        let name = names::sanitize(first);
        let key = link_key(&name);
        let at = match self.folders.iter().position(|f| link_key(&f.name) == key) {
            Some(at) => at,
            None => {
                self.folders.push(PlannedFolder::named(&name));
                self.folders.len() - 1
            }
        };
        self.folders[at].descend(rest)
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
enum Kind {
    Docx,
    Text,
    Zip,
    LegacyWord,
    GoogleShortcut,
    Other,
}

fn kind_of(file_name: &str) -> Kind {
    let ext = Path::new(file_name)
        .extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    match ext.as_str() {
        "docx" => Kind::Docx,
        "md" | "markdown" | "txt" => Kind::Text,
        "zip" => Kind::Zip,
        "doc" => Kind::LegacyWord,
        "gdoc" | "gsheet" | "gslides" => Kind::GoogleShortcut,
        _ => Kind::Other,
    }
}

/// Dotfiles and Word's `~$` lock files, and macOS's resource-fork copies in zips.
fn is_hidden(file_name: &str) -> bool {
    file_name.starts_with('.') || file_name.starts_with("~$")
}

fn skip(path: impl Into<String>, reason: SkipReason) -> SkippedDocumentDto {
    SkippedDocumentDto {
        path: path.into(),
        reason,
    }
}

fn stem(file_name: &str) -> String {
    Path::new(file_name)
        .file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_default()
}

fn note(file_name: &str, body: String, path: String) -> PlannedNote {
    PlannedNote {
        title: names::sanitize(&stem(file_name)),
        body,
        source: file_name.to_string(),
        path,
    }
}

fn from_docx(e: DocxError) -> SkipReason {
    match e {
        DocxError::TooLarge => SkipReason::TooLarge,
        DocxError::Invalid(why) => {
            tracing::debug!(why, "unreadable .docx");
            SkipReason::Unreadable
        }
    }
}

/// Note text from a document's bytes.
fn convert(kind: Kind, bytes: Vec<u8>) -> Result<String, SkipReason> {
    let body = match kind {
        Kind::Docx => docx::to_markdown(Cursor::new(bytes), MAX_DOCX_XML_BYTES).map_err(from_docx)?,
        _ => text::decode(&bytes),
    };
    if body.chars().count() > NOTE_MAX_CHARS {
        return Err(SkipReason::TooLong);
    }
    Ok(body)
}

fn cap(kind: Kind) -> u64 {
    if kind == Kind::Docx {
        MAX_DOC_BYTES
    } else {
        MAX_TEXT_BYTES
    }
}

/// Reads at most `max` bytes; more than that is too large.
fn read_capped(reader: impl Read, max: u64) -> Result<Vec<u8>, SkipReason> {
    let mut bytes = Vec::new();
    reader
        .take(max + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| SkipReason::Unreadable)?;
    if bytes.len() as u64 > max {
        return Err(SkipReason::TooLarge);
    }
    Ok(bytes)
}

fn read_file(path: &Path, len: u64, kind: Kind) -> Result<String, SkipReason> {
    if len > cap(kind) {
        return Err(SkipReason::TooLarge);
    }
    let file = File::open(path).map_err(|_| SkipReason::Unreadable)?;
    convert(kind, read_capped(BufReader::new(file), cap(kind))?)
}

struct Reading {
    plan: Planned,
    /// Files still to look at before the import stops walking.
    budget: usize,
}

impl Reading {
    fn take_budget(&mut self) -> bool {
        if self.budget == 0 {
            return false;
        }
        self.budget -= 1;
        if self.budget == 0 {
            tracing::warn!(limit = MAX_IMPORT_FILES, "import file limit reached; the rest is left out");
        }
        true
    }

    /// One file inside a picked folder or zip: a document, a known non-document, or ignored.
    fn classify(&mut self, kind: Kind, rel: &str) -> bool {
        match kind {
            Kind::Docx | Kind::Text => return true,
            Kind::LegacyWord => self.plan.skipped.push(skip(rel, SkipReason::LegacyWord)),
            Kind::GoogleShortcut => self.plan.skipped.push(skip(rel, SkipReason::GoogleShortcut)),
            Kind::Zip | Kind::Other => self.plan.ignored += 1,
        }
        false
    }

    fn walk(&mut self, dir: &Path, folder: &mut PlannedFolder, rel: &str) {
        let mut entries: Vec<_> = match fs::read_dir(dir) {
            Ok(list) => list.flatten().collect(),
            Err(_) => {
                self.plan.skipped.push(skip(rel, SkipReason::Unreadable));
                return;
            }
        };
        entries.sort_by_key(|e| e.file_name());
        for entry in entries {
            let name = entry.file_name().to_string_lossy().into_owned();
            if is_hidden(&name) {
                continue;
            }
            let rel = format!("{rel}/{name}");
            let Ok(file_type) = entry.file_type() else { continue };
            if file_type.is_dir() {
                let mut sub = PlannedFolder::named(&name);
                self.walk(&entry.path(), &mut sub, &rel);
                if !sub.is_empty() {
                    folder.folders.push(sub);
                }
            } else if file_type.is_file() {
                if !self.take_budget() {
                    return;
                }
                let kind = kind_of(&name);
                if !self.classify(kind, &rel) {
                    continue;
                }
                let len = entry.metadata().map(|m| m.len()).unwrap_or(0);
                match read_file(&entry.path(), len, kind) {
                    Ok(body) => folder.notes.push(note(&name, body, rel)),
                    Err(reason) => self.plan.skipped.push(skip(rel, reason)),
                }
            }
        }
    }

    /// A zip is a folder named after it. The directories every document sits under (a
    /// Takeout zip's `Takeout/Drive/`) are dropped, so they don't become empty folders.
    fn zip(&mut self, path: &Path, shown: &str) -> Option<PlannedFolder> {
        let file_name = path
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_else(|| shown.to_string());
        let opened = File::open(path).ok().and_then(|f| ZipArchive::new(BufReader::new(f)).ok());
        let Some(mut zip) = opened else {
            self.plan.skipped.push(skip(shown, SkipReason::Unreadable));
            return None;
        };
        let mut docs: Vec<(String, Vec<String>, String, Kind)> = Vec::new();
        let names: Vec<String> = zip.file_names().map(str::to_string).collect();
        for entry in names {
            let normalized = entry.replace('\\', "/");
            if normalized.ends_with('/') {
                continue;
            }
            let mut segments: Vec<String> = normalized
                .split('/')
                .filter(|s| !s.is_empty() && *s != ".")
                .map(str::to_string)
                .collect();
            let Some(name) = segments.pop() else { continue };
            if segments.first().is_some_and(|s| s == "__MACOSX") || is_hidden(&name) {
                continue;
            }
            if !self.take_budget() {
                break;
            }
            let rel = format!("{file_name}/{normalized}");
            if segments.iter().any(|s| s == "..") {
                self.plan.ignored += 1;
                continue;
            }
            let kind = kind_of(&name);
            if self.classify(kind, &rel) {
                docs.push((entry, segments, name, kind));
            }
        }
        let shared = common_prefix(docs.iter().map(|(_, dirs, _, _)| dirs.as_slice()));
        let mut root = PlannedFolder::named(&stem(&file_name));
        for (entry, dirs, name, kind) in docs {
            let rel = format!("{file_name}/{}", entry.replace('\\', "/"));
            let read = zip
                .by_name(&entry)
                .map_err(|_| SkipReason::Unreadable)
                .and_then(|e| if e.size() > cap(kind) { Err(SkipReason::TooLarge) } else { read_capped(e, cap(kind)) })
                .and_then(|bytes| convert(kind, bytes));
            match read {
                Ok(body) => root.descend(&dirs[shared..]).notes.push(note(&name, body, rel)),
                Err(reason) => self.plan.skipped.push(skip(rel, reason)),
            }
        }
        Some(root)
    }
}

/// How many leading directories all the lists share.
fn common_prefix<'a>(mut lists: impl Iterator<Item = &'a [String]>) -> usize {
    let Some(first) = lists.next() else { return 0 };
    lists.fold(first.len(), |shared, dirs| {
        first.iter().zip(dirs).take(shared).take_while(|(a, b)| a == b).count()
    })
}

/// Reads every picked path: files, folders (recursively) and zips. Never fails; what can't
/// be read is listed as skipped.
pub fn read(paths: &[String]) -> Planned {
    let mut reading = Reading {
        plan: Planned::default(),
        budget: MAX_IMPORT_FILES,
    };
    for raw in paths {
        let path = Path::new(raw);
        let name = path
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_else(|| raw.clone());
        let Ok(meta) = fs::metadata(path) else {
            reading.plan.skipped.push(skip(raw.as_str(), SkipReason::Unreadable));
            continue;
        };
        if meta.is_dir() {
            let mut folder = PlannedFolder::named(&name);
            reading.walk(path, &mut folder, &name);
            if !folder.is_empty() {
                reading.plan.root.folders.push(folder);
            }
            continue;
        }
        match kind_of(&name) {
            Kind::Zip => {
                if let Some(folder) = reading.zip(path, raw).filter(|f| !f.is_empty()) {
                    reading.plan.root.folders.push(folder);
                }
            }
            kind @ (Kind::Docx | Kind::Text) => match read_file(path, meta.len(), kind) {
                Ok(body) => reading.plan.root.notes.push(note(&name, body, raw.clone())),
                Err(reason) => reading.plan.skipped.push(skip(raw.as_str(), reason)),
            },
            Kind::LegacyWord => reading.plan.skipped.push(skip(raw.as_str(), SkipReason::LegacyWord)),
            Kind::GoogleShortcut => reading.plan.skipped.push(skip(raw.as_str(), SkipReason::GoogleShortcut)),
            Kind::Other => reading.plan.skipped.push(skip(raw.as_str(), SkipReason::Unsupported)),
        }
    }
    reading.plan
}

/// Writes what was read into `folder` (None: the top level), in one transaction. Folders
/// that are already there are reused; a note already there with the same text is skipped.
pub fn write(conn: &Connection, plan: Planned, folder: Option<i64>) -> AppResult<ImportedDocumentsDto> {
    let tx = conn.unchecked_transaction()?;
    ops::ensure_folder(&tx, folder)?;
    let mut out = ImportedDocumentsDto {
        skipped: plan.skipped,
        ignored: plan.ignored,
        ..ImportedDocumentsDto::default()
    };
    write_folder(&tx, &plan.root, folder, &mut out)?;
    tx.commit()?;
    tracing::info!(notes = out.notes.len(), folders = out.folders.len(), skipped = out.skipped.len(), "imported documents");
    Ok(out)
}

fn write_folder(conn: &Connection, planned: &PlannedFolder, parent: Option<i64>, out: &mut ImportedDocumentsDto) -> AppResult<()> {
    for note in &planned.notes {
        if repo::has_copy(conn, parent, &link_key(&note.title), &note.source, &note.body)? {
            out.skipped.push(skip(note.path.as_str(), SkipReason::Duplicate));
            continue;
        }
        let title = ops::free_note_title(conn, parent, &note.title)?;
        out.notes.push(repo::insert_note(conn, parent, &title, &note.body, Some(&note.source))?.into());
    }
    for sub in &planned.folders {
        let id = match repo::folder_named(conn, parent, &link_key(&sub.name))? {
            Some(existing) => existing.id,
            None => {
                let row = repo::insert_folder(conn, parent, &sub.name)?;
                let id = row.id;
                out.folders.push(row.into());
                id
            }
        };
        write_folder(conn, sub, Some(id), out)?;
    }
    Ok(())
}

#[cfg(test)]
#[path = "import_tests.rs"]
mod tests;
