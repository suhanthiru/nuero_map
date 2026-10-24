import { nameKey, nameProblem, normalizeName, uniqueName, UNTITLED } from "../../features/vault/model/names";
import { folderAndBelow } from "../../features/vault/model/tree";
import type {
  CommandArgs,
  ImportedDocuments,
  SearchHit,
  SkippedDocument,
  VaultFolder,
  VaultNote,
  VaultNoteSummary,
  VaultTree,
} from "../contract";
import { NOTE_MAX_CHARS } from "../contract/notes";
import { MOCK_FOLDERS, MOCK_VAULT_NOTES } from "./fixtures/vault";

/** The mock's notes and folders, following the same rules as the backend (`src-tauri/src/vault`). */
let folders: readonly VaultFolder[] = MOCK_FOLDERS;
let notes: readonly VaultNote[] = MOCK_VAULT_NOTES;
let nextId = 1;

const now = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}-new-${nextId++}`;

function fail(code: string, message: string): never {
  throw { code, message };
}

function summary(note: VaultNote): VaultNoteSummary {
  const { body: _body, ...rest } = note;
  return rest;
}

function folderById(folderId: string): VaultFolder {
  return folders.find((f) => f.id === folderId) ?? fail("not_found", `folder ${folderId}`);
}

function noteById(noteId: string): VaultNote {
  return notes.find((n) => n.id === noteId) ?? fail("not_found", `note ${noteId}`);
}

function ensureFolder(folderId: string | null): void {
  if (folderId !== null) folderById(folderId);
}

function validName(name: string): string {
  const problem = nameProblem(name);
  if (problem) fail("invalid_input", problem);
  return normalizeName(name);
}

const folderNames = (parentId: string | null, except?: string) =>
  folders.filter((f) => f.parentId === parentId && f.id !== except).map((f) => f.name);
const noteTitles = (folderId: string | null, except?: string) =>
  notes.filter((n) => n.folderId === folderId && n.id !== except).map((n) => n.title);
const taken = (names: readonly string[], name: string) => names.some((n) => nameKey(n) === nameKey(name));

function replaceNote(next: VaultNote): VaultNote {
  notes = notes.map((n) => (n.id === next.id ? next : n));
  return next;
}

export function getVault(): VaultTree {
  return { folders: [...folders], notes: notes.map(summary) };
}

export function createFolder({ parentId, name }: CommandArgs<"create_folder">): VaultFolder {
  ensureFolder(parentId);
  const chosen = name === null ? uniqueName(UNTITLED, folderNames(parentId)) : validName(name);
  if (taken(folderNames(parentId), chosen)) fail("conflict", `folder ${chosen}`);
  const folder: VaultFolder = { id: id("f"), parentId, name: chosen, createdAt: now() };
  folders = [...folders, folder];
  return folder;
}

export function renameFolder({ id: folderId, name }: CommandArgs<"rename_folder">): VaultFolder {
  const folder = folderById(folderId);
  const clean = validName(name);
  if (taken(folderNames(folder.parentId, folderId), clean)) fail("conflict", `folder ${clean}`);
  const next = { ...folder, name: clean };
  folders = folders.map((f) => (f.id === folderId ? next : f));
  return next;
}

export function moveFolder({ id: folderId, parentId }: CommandArgs<"move_folder">): VaultFolder {
  const folder = folderById(folderId);
  ensureFolder(parentId);
  if (parentId !== null && folderAndBelow(folderId, folders).has(parentId)) fail("invalid_input", "a folder can't move inside itself");
  if (taken(folderNames(parentId, folderId), folder.name)) fail("conflict", `folder ${folder.name}`);
  const next = { ...folder, parentId };
  folders = folders.map((f) => (f.id === folderId ? next : f));
  return next;
}

export function deleteFolder({ id: folderId }: CommandArgs<"delete_folder">): string[] {
  folderById(folderId);
  const gone = folderAndBelow(folderId, folders);
  const deleted = notes.filter((n) => n.folderId !== null && gone.has(n.folderId)).map((n) => n.id);
  folders = folders.filter((f) => !gone.has(f.id));
  notes = notes.filter((n) => !deleted.includes(n.id));
  return deleted;
}

export function createNote({ folderId, title, body }: CommandArgs<"create_note">): VaultNote {
  ensureFolder(folderId);
  if (body.length > NOTE_MAX_CHARS) fail("invalid_input", "note is too long");
  const chosen = title === null ? uniqueName(UNTITLED, noteTitles(folderId)) : validName(title);
  if (taken(noteTitles(folderId), chosen)) fail("conflict", `note ${chosen}`);
  const at = now();
  const note: VaultNote = { id: id("n"), folderId, title: chosen, body, createdAt: at, updatedAt: at, source: null };
  notes = [...notes, note];
  return note;
}

export function getNote({ id: noteId }: CommandArgs<"get_note">): VaultNote {
  return noteById(noteId);
}

export function saveNote({ id: noteId, body }: CommandArgs<"save_note">): VaultNote {
  const note = noteById(noteId);
  if (body.length > NOTE_MAX_CHARS) fail("invalid_input", "note is too long");
  return replaceNote({ ...note, body, updatedAt: now() });
}

export function renameNote({ id: noteId, title }: CommandArgs<"rename_note">): VaultNoteSummary {
  const note = noteById(noteId);
  const clean = validName(title);
  if (taken(noteTitles(note.folderId, noteId), clean)) fail("conflict", `note ${clean}`);
  return summary(replaceNote({ ...note, title: clean, updatedAt: now() }));
}

export function moveNote({ id: noteId, folderId }: CommandArgs<"move_note">): VaultNoteSummary {
  const note = noteById(noteId);
  ensureFolder(folderId);
  if (taken(noteTitles(folderId, noteId), note.title)) fail("conflict", `note ${note.title}`);
  return summary(replaceNote({ ...note, folderId }));
}

export function deleteNote({ id: noteId }: CommandArgs<"delete_note">): null {
  noteById(noteId);
  notes = notes.filter((n) => n.id !== noteId);
  return null;
}

const DOCUMENT = /\.(docx|md|markdown|txt)$/i;

function baseName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

function stem(name: string): string {
  return name.replace(/\.[^.]+$/, "") || name;
}

function skipReason(path: string): SkippedDocument["reason"] | null {
  if (/\.doc$/i.test(path)) return "legacy_word";
  if (/\.(gdoc|gsheet|gslides)$/i.test(path)) return "google_shortcut";
  if (DOCUMENT.test(path) || /\.zip$/i.test(path) || !/\.[^\\/.]+$/.test(path)) return null;
  return "unsupported";
}

function importFile(path: string, folderId: string | null, out: VaultNoteSummary[]): void {
  const name = baseName(path);
  const title = uniqueName(stem(name).replace(/[\\/[\]|]/g, "-"), noteTitles(folderId));
  const body = `# ${stem(name)}\n\nImported from ${name} (mock data: the app reads the real file).\n`;
  const at = now();
  const note: VaultNote = { id: id("n"), folderId, title, body, createdAt: at, updatedAt: at, source: name };
  notes = [...notes, note];
  out.push(summary(note));
}

/** A path ending in a document extension is a file; a .zip or a path without one is treated as a folder of two docs. */
export function importDocuments({ paths, folderId }: CommandArgs<"import_documents">): ImportedDocuments {
  ensureFolder(folderId);
  const created: VaultNoteSummary[] = [];
  const newFolders: VaultFolder[] = [];
  const skipped: SkippedDocument[] = [];
  for (const path of paths) {
    const reason = skipReason(path);
    if (reason) {
      skipped.push({ path, reason });
      continue;
    }
    if (DOCUMENT.test(path)) {
      importFile(path, folderId, created);
      continue;
    }
    const name = stem(baseName(path));
    const existing = folders.find((f) => f.parentId === folderId && nameKey(f.name) === nameKey(name));
    const target = existing ?? createFolder({ parentId: folderId, name });
    if (!existing) newFolders.push(target);
    importFile(`${path}\\Meeting notes.docx`, target.id, created);
    importFile(`${path}\\Reading list.md`, target.id, created);
  }
  return { notes: created, folders: newFolders, skipped, ignored: 0 };
}

const SNIPPET_CHARS = 140;

export function searchNotes(query: string): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return notes
    .filter((n) => n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q))
    .map((n) => {
      const at = Math.max(0, n.body.toLowerCase().indexOf(q) - 40);
      return { kind: "note", id: n.id, topicId: null, noteId: n.id, title: n.title, snippet: n.body.slice(at, at + SNIPPET_CHARS), score: 0.8 };
    });
}

/** Test hook: back to the fixtures. */
export function resetMockVault(): void {
  folders = MOCK_FOLDERS;
  notes = MOCK_VAULT_NOTES;
}
