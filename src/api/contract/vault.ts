import type { IsoDateTime } from "./ids";

export type FolderId = string;
export type NoteId = string;

/** Longest note title or folder name, in characters. */
export const VAULT_NAME_MAX_CHARS = 200;

/**
 * Characters a note title or folder name can't hold: path separators (so the vault can be
 * written out as files later) and `[[link|syntax]]`. Control characters are refused too.
 */
export const VAULT_NAME_FORBIDDEN = ["\\", "/", "[", "]", "|"] as const;

/** A folder in the user's own notes. Folders nest; names are unique among siblings, ignoring case. */
export interface VaultFolder {
  readonly id: FolderId;
  /** Null at the top level. */
  readonly parentId: FolderId | null;
  readonly name: string;
  readonly createdAt: IsoDateTime;
}

/** A note the user wrote or imported, not tied to a topic. Titles are unique within a folder, ignoring case. */
export interface VaultNoteSummary {
  readonly id: NoteId;
  /** Null at the top level. */
  readonly folderId: FolderId | null;
  readonly title: string;
  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
  /** The file an imported note came from (its name, e.g. "Plan.docx"); null for notes written here. */
  readonly source: string | null;
}

export interface VaultNote extends VaultNoteSummary {
  /** Markdown. `[[Title]]` links a topic or another note by title. */
  readonly body: string;
}

/** Every folder and note (without bodies), in no particular order. */
export interface VaultTree {
  readonly folders: readonly VaultFolder[];
  readonly notes: readonly VaultNoteSummary[];
}

/**
 * Why a picked file didn't become a note:
 * - `unsupported`: not a .docx, .md, .markdown, .txt or .zip
 * - `legacy_word`: an old binary .doc (save it as .docx first)
 * - `google_shortcut`: a Google Drive .gdoc/.gsheet shortcut, which holds no text (download the doc as .docx)
 * - `too_long`: the text is over the note limit
 * - `too_large`: the file is too big to read safely
 * - `duplicate`: a note with the same title and text is already in that folder
 * - `unreadable`: damaged, or couldn't be opened
 */
export type SkipReason = "unsupported" | "legacy_word" | "google_shortcut" | "too_long" | "too_large" | "duplicate" | "unreadable";

export interface SkippedDocument {
  /** The file's path as picked, or its path inside a picked folder or zip. */
  readonly path: string;
  readonly reason: SkipReason;
}

export interface ImportedDocuments {
  /** Notes created, in the order they were read. */
  readonly notes: readonly VaultNoteSummary[];
  /** Folders created (a picked folder, and its subfolders that held documents). Existing folders are reused, not listed. */
  readonly folders: readonly VaultFolder[];
  readonly skipped: readonly SkippedDocument[];
  /** Files inside picked folders and zips that aren't documents (images, PDFs…), left out without comment. */
  readonly ignored: number;
}
