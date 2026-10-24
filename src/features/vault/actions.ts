import { useEffect } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { call } from "../../api/api";
import { AppError, userMessageOf } from "../../api/errors";
import type { FolderId, ImportedDocuments, NoteId, VaultTree } from "../../api/contract";
import { useNoteModes } from "../topic/noteMode";
import { focusedView } from "../workspace/model/panes";
import { notify } from "../workspace/notices";
import { useWorkspace } from "../workspace/workspaceStore";
import { folderAndBelow, notesUnder } from "./model/tree";
import { dropFromTree, putFolder, putNote, vaultKeys } from "./queries";
import { useVaultUi, type VaultItem } from "./vaultStore";

/**
 * Vault changes that commands, menus and the explorer share. They need the app's query
 * client to keep the tree in step, so the workspace binds it once (`useBindVaultActions`).
 */
let bound: QueryClient | null = null;

export function useBindVaultActions(): void {
  const client = useQueryClient();
  useEffect(() => {
    bound = client;
    return () => {
      if (bound === client) bound = null;
    };
  }, [client]);
}

function client(): QueryClient {
  if (!bound) throw new Error("vault actions used before the workspace mounted");
  return bound;
}

const ws = () => useWorkspace.getState();
const ui = () => useVaultUi.getState();

function tree(): VaultTree {
  return client().getQueryData<VaultTree>(vaultKeys.tree) ?? { folders: [], notes: [] };
}

/** The folder a new note goes in: the focused note's folder, else the top level. */
export function currentFolder(): FolderId | null {
  const view = focusedView(ws().layout);
  if (view.kind !== "note") return null;
  return tree().notes.find((n) => n.id === view.noteId)?.folderId ?? null;
}

/** Opens `folderId` and every folder above it in the explorer. */
export function revealFolder(folderId: FolderId | null): void {
  const byId = new Map(tree().folders.map((f) => [f.id, f]));
  const chain: FolderId[] = [];
  for (let id = folderId; id !== null && !chain.includes(id); id = byId.get(id)?.parentId ?? null) chain.push(id);
  ui().expand(chain);
}

function failed(what: string, err: unknown): void {
  const conflict = err instanceof AppError && err.code === "conflict";
  notify(conflict ? `Couldn't ${what}: something with that name is already there.` : `Couldn't ${what}: ${userMessageOf(err)}`);
}

/** Creates "Untitled" (or "Untitled 1"…) and opens it for writing, title selected. */
export async function newNote(folderId: FolderId | null = currentFolder(), opts: { readonly newTab?: boolean } = {}): Promise<NoteId | null> {
  try {
    const note = await call("create_note", { folderId, title: null, body: "" });
    putNote(client(), note);
    revealFolder(folderId);
    ui().setFreshNote(note.id);
    ws().open({ kind: "note", noteId: note.id }, { newTab: opts.newTab });
    useNoteModes.getState().setMode(ws().ws.activeId, "editing");
    return note.id;
  } catch (err) {
    failed("create a note", err);
    return null;
  }
}

/** Creates "Untitled" (or the next free name) and puts its row into rename mode. */
export async function newFolder(parentId: FolderId | null = currentFolder()): Promise<FolderId | null> {
  try {
    const folder = await call("create_folder", { parentId, name: null });
    putFolder(client(), folder);
    revealFolder(parentId);
    ws().setLeftPane("notes");
    ui().setRenaming({ kind: "folder", id: folder.id });
    return folder.id;
  } catch (err) {
    failed("create a folder", err);
    return null;
  }
}

/** Resolves true when the name was taken (or unchanged). */
export async function renameItem(item: VaultItem, name: string): Promise<boolean> {
  try {
    if (item.kind === "folder") putFolder(client(), await call("rename_folder", { id: item.id, name }));
    else putNote(client(), await call("rename_note", { id: item.id, title: name }));
    return true;
  } catch (err) {
    failed("rename it", err);
    return false;
  }
}

export async function moveItem(item: VaultItem, folderId: FolderId | null): Promise<boolean> {
  try {
    if (item.kind === "folder") putFolder(client(), await call("move_folder", { id: item.id, parentId: folderId }));
    else putNote(client(), await call("move_note", { id: item.id, folderId }));
    revealFolder(folderId);
    return true;
  } catch (err) {
    failed("move it", err);
    return false;
  }
}

/** Deletes a note, or a folder with everything in it; their tabs and bookmarks close. */
export async function deleteItem(item: VaultItem): Promise<boolean> {
  try {
    let notes: ReadonlySet<NoteId>;
    let folders: ReadonlySet<FolderId> | undefined;
    if (item.kind === "folder") {
      folders = folderAndBelow(item.id, tree().folders);
      const listed = notesUnder(item.id, tree()).map((n) => n.id);
      notes = new Set([...listed, ...(await call("delete_folder", { id: item.id }))]);
    } else {
      await call("delete_note", { id: item.id });
      notes = new Set([item.id]);
    }
    dropFromTree(client(), { folders, notes });
    ws().pruneViews((v) => v.kind !== "note" || !notes.has(v.noteId));
    return true;
  } catch (err) {
    failed("delete it", err);
    return false;
  }
}

/** Imports files and folders into `folderId`, then opens that folder in the explorer. */
export async function importDocuments(paths: readonly string[], folderId: FolderId | null): Promise<ImportedDocuments> {
  const result = await call("import_documents", { paths: [...paths], folderId });
  await client().invalidateQueries({ queryKey: vaultKeys.tree });
  revealFolder(folderId);
  ui().expand(result.folders.map((f) => f.id));
  ws().setLeftPane("notes");
  return result;
}
