//! What the vault commands send to the frontend (`src/api/contract/vault.ts`).

use serde::Serialize;

use crate::db::repo::vault::{FolderRow, NoteRow};

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultFolderDto {
    pub id: String,
    pub parent_id: Option<String>,
    pub name: String,
    pub created_at: String,
}

impl From<FolderRow> for VaultFolderDto {
    fn from(f: FolderRow) -> Self {
        Self {
            id: f.id.to_string(),
            parent_id: f.parent_id.map(|p| p.to_string()),
            name: f.name,
            created_at: f.created_at,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultNoteSummaryDto {
    pub id: String,
    pub folder_id: Option<String>,
    pub title: String,
    pub created_at: String,
    pub updated_at: String,
    pub source: Option<String>,
}

impl From<NoteRow> for VaultNoteSummaryDto {
    fn from(n: NoteRow) -> Self {
        Self {
            id: n.id.to_string(),
            folder_id: n.folder_id.map(|f| f.to_string()),
            title: n.title,
            created_at: n.created_at,
            updated_at: n.updated_at,
            source: n.source,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultNoteDto {
    #[serde(flatten)]
    pub summary: VaultNoteSummaryDto,
    pub body: String,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultTreeDto {
    pub folders: Vec<VaultFolderDto>,
    pub notes: Vec<VaultNoteSummaryDto>,
}

/// Why a picked document didn't become a note (`SkipReason` on the frontend).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SkipReason {
    Unsupported,
    LegacyWord,
    GoogleShortcut,
    TooLong,
    TooLarge,
    Duplicate,
    Unreadable,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkippedDocumentDto {
    /// As picked for a picked file; else from the picked folder's or zip's own name down,
    /// with `/` separators ("Work/Old/report.doc", "takeout.zip/Takeout/Drive/a.gdoc").
    pub path: String,
    pub reason: SkipReason,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedDocumentsDto {
    pub notes: Vec<VaultNoteSummaryDto>,
    pub folders: Vec<VaultFolderDto>,
    pub skipped: Vec<SkippedDocumentDto>,
    pub ignored: usize,
}
