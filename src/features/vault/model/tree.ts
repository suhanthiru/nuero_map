import type { FolderId, VaultFolder, VaultNoteSummary, VaultTree } from "../../../api/contract";
import { nameKey } from "./names";

export type NoteSort = "name" | "name-desc" | "modified" | "modified-old" | "created" | "created-old";

export const NOTE_SORT_LABEL: Readonly<Record<NoteSort, string>> = {
  name: "File name (A to Z)",
  "name-desc": "File name (Z to A)",
  modified: "Modified time (new to old)",
  "modified-old": "Modified time (old to new)",
  created: "Created time (new to old)",
  "created-old": "Created time (old to new)",
};

export const NOTE_SORTS = Object.keys(NOTE_SORT_LABEL) as NoteSort[];

export interface FolderNode {
  readonly folder: VaultFolder;
  readonly folders: readonly FolderNode[];
  readonly notes: readonly VaultNoteSummary[];
  /** Notes in this folder and every folder below it. */
  readonly noteCount: number;
}

export interface VaultView {
  /** Top-level folders and notes. */
  readonly folders: readonly FolderNode[];
  readonly notes: readonly VaultNoteSummary[];
}

const byName = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });

function compareNotes(sort: NoteSort): (a: VaultNoteSummary, b: VaultNoteSummary) => number {
  const name = (a: VaultNoteSummary, b: VaultNoteSummary) => byName(a.title, b.title);
  switch (sort) {
    case "name":
      return name;
    case "name-desc":
      return (a, b) => name(b, a);
    case "modified":
      return (a, b) => b.updatedAt.localeCompare(a.updatedAt) || name(a, b);
    case "modified-old":
      return (a, b) => a.updatedAt.localeCompare(b.updatedAt) || name(a, b);
    case "created":
      return (a, b) => b.createdAt.localeCompare(a.createdAt) || name(a, b);
    case "created-old":
      return (a, b) => a.createdAt.localeCompare(b.createdAt) || name(a, b);
  }
}

/** Folders by name (Z to A only when notes are), then notes in the chosen order, at every level. */
export function buildTree(tree: VaultTree, sort: NoteSort): VaultView {
  const folderOrder = sort === "name-desc" ? (a: VaultFolder, b: VaultFolder) => byName(b.name, a.name) : (a: VaultFolder, b: VaultFolder) => byName(a.name, b.name);
  const ids = new Set(tree.folders.map((f) => f.id));
  // A parent the list doesn't have (a stale cache mid-delete) puts the child at the top.
  const parentOf = (id: FolderId | null) => (id !== null && ids.has(id) ? id : null);
  const childFolders = groupBy(tree.folders, (f) => parentOf(f.parentId));
  const childNotes = groupBy(tree.notes, (n) => parentOf(n.folderId));
  const noteOrder = compareNotes(sort);

  const build = (folder: VaultFolder, seen: ReadonlySet<FolderId>): FolderNode => {
    const path = new Set(seen).add(folder.id);
    const folders = (childFolders.get(folder.id) ?? []).filter((f) => !path.has(f.id)).sort(folderOrder).map((f) => build(f, path));
    const notes = [...(childNotes.get(folder.id) ?? [])].sort(noteOrder);
    return { folder, folders, notes, noteCount: notes.length + folders.reduce((n, f) => n + f.noteCount, 0) };
  };
  return {
    folders: [...(childFolders.get(null) ?? [])].sort(folderOrder).map((f) => build(f, new Set())),
    notes: [...(childNotes.get(null) ?? [])].sort(noteOrder),
  };
}

function groupBy<T>(items: readonly T[], key: (item: T) => FolderId | null): Map<FolderId | null, T[]> {
  const out = new Map<FolderId | null, T[]>();
  for (const item of items) {
    const k = key(item);
    out.set(k, [...(out.get(k) ?? []), item]);
  }
  return out;
}

/** Folder names from the top down to `folderId` (empty at the top level). */
export function folderPath(folderId: FolderId | null, folders: readonly VaultFolder[]): string[] {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const names: string[] = [];
  const seen = new Set<FolderId>();
  for (let id = folderId; id !== null && !seen.has(id); ) {
    seen.add(id);
    const folder = byId.get(id);
    if (!folder) break;
    names.unshift(folder.name);
    id = folder.parentId;
  }
  return names;
}

/** `folderId` and every folder below it. */
export function folderAndBelow(folderId: FolderId, folders: readonly VaultFolder[]): Set<FolderId> {
  const out = new Set<FolderId>([folderId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const f of folders) {
      if (f.parentId !== null && out.has(f.parentId) && !out.has(f.id)) {
        out.add(f.id);
        grew = true;
      }
    }
  }
  return out;
}

/** Notes that live in `folderId` or below it. */
export function notesUnder(folderId: FolderId, tree: VaultTree): VaultNoteSummary[] {
  const inside = folderAndBelow(folderId, tree.folders);
  return tree.notes.filter((n) => n.folderId !== null && inside.has(n.folderId));
}

export type MoveCheck = { readonly ok: true } | { readonly ok: false; readonly reason: string };

/** Whether a folder can move under `parentId` (null = top level): not into itself, not below itself, no name clash. */
export function canMoveFolder(folder: VaultFolder, parentId: FolderId | null, tree: VaultTree): MoveCheck {
  if (folder.parentId === parentId) return { ok: false, reason: "It's already there." };
  if (parentId !== null && folderAndBelow(folder.id, tree.folders).has(parentId)) {
    return { ok: false, reason: "A folder can't go inside itself." };
  }
  const clash = tree.folders.some((f) => f.parentId === parentId && f.id !== folder.id && nameKey(f.name) === nameKey(folder.name));
  return clash ? { ok: false, reason: `There's already a folder named “${folder.name}” there.` } : { ok: true };
}

/** Whether a note can move into `folderId` (null = top level) without a title clash. */
export function canMoveNote(note: VaultNoteSummary, folderId: FolderId | null, tree: VaultTree): MoveCheck {
  if (note.folderId === folderId) return { ok: false, reason: "It's already there." };
  const clash = tree.notes.some((n) => n.folderId === folderId && n.id !== note.id && nameKey(n.title) === nameKey(note.title));
  return clash ? { ok: false, reason: `There's already a note named “${note.title}” there.` } : { ok: true };
}

/** Names already used by folders (or notes) directly inside `parentId`. */
export function siblingNames(tree: VaultTree, parentId: FolderId | null, kind: "folder" | "note"): string[] {
  return kind === "folder"
    ? tree.folders.filter((f) => f.parentId === parentId).map((f) => f.name)
    : tree.notes.filter((n) => n.folderId === parentId).map((n) => n.title);
}
