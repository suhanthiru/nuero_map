import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { call } from "../../api/api";
import { userMessageOf } from "../../api/errors";
import type { FolderId, NoteId, VaultFolder, VaultNote, VaultNoteSummary, VaultTree } from "../../api/contract";
import { notify } from "../workspace/notices";

export const vaultKeys = {
  tree: ["vault"] as const,
  note: (id: NoteId) => ["vaultNote", id] as const,
};

/** Every folder and note, shared by the explorer, tab titles, links and the quick switcher. */
export function useVault() {
  return useQuery({ queryKey: vaultKeys.tree, queryFn: () => call("get_vault", {}) });
}

export function useNoteIndex(): ReadonlyMap<NoteId, VaultNoteSummary> {
  const vault = useVault();
  return new Map((vault.data?.notes ?? []).map((n) => [n.id, n]));
}

export function useVaultNote(id: NoteId) {
  return useQuery({ queryKey: vaultKeys.note(id), queryFn: () => call("get_note", { id }) });
}

function patchTree(client: QueryClient, fn: (tree: VaultTree) => VaultTree): void {
  client.setQueryData<VaultTree>(vaultKeys.tree, (tree) => (tree ? fn(tree) : tree));
}

function summaryOf(note: VaultNote | VaultNoteSummary): VaultNoteSummary {
  const { id, folderId, title, createdAt, updatedAt, source } = note;
  return { id, folderId, title, createdAt, updatedAt, source };
}

/** Puts a folder into the cached tree (replacing one with its id). */
export function putFolder(client: QueryClient, folder: VaultFolder): void {
  patchTree(client, (t) => ({ ...t, folders: [...t.folders.filter((f) => f.id !== folder.id), folder] }));
}

/** Puts a note's summary into the cached tree, and its title and folder into an open note. */
export function putNote(client: QueryClient, note: VaultNote | VaultNoteSummary): void {
  const summary = summaryOf(note);
  patchTree(client, (t) => ({ ...t, notes: [...t.notes.filter((n) => n.id !== summary.id), summary] }));
  client.setQueryData<VaultNote>(vaultKeys.note(summary.id), (open) => (open ? { ...open, ...summary } : "body" in note ? note : open));
}

/** Takes notes (and, for a folder, the folder and everything below it) out of the cache. */
export function dropFromTree(client: QueryClient, gone: { readonly folders?: ReadonlySet<FolderId>; readonly notes: ReadonlySet<NoteId> }): void {
  patchTree(client, (t) => ({
    folders: gone.folders ? t.folders.filter((f) => !gone.folders?.has(f.id)) : t.folders,
    notes: t.notes.filter((n) => !gone.notes.has(n.id)),
  }));
  for (const id of gone.notes) client.removeQueries({ queryKey: vaultKeys.note(id) });
}

/**
 * Saves the whole body. Saves for one note run one at a time, in order. Optimistic: the
 * reading view and word count show the new text at once; a failed save keeps the text on
 * screen (the page offers a retry) instead of reverting to what's stored.
 */
export function useSaveVaultNote(id: NoteId) {
  const client = useQueryClient();
  const key = vaultKeys.note(id);
  return useMutation({
    scope: { id: `vault-note-${id}` },
    mutationFn: (body: string) => call("save_note", { id, body }),
    onMutate: async (body) => {
      await client.cancelQueries({ queryKey: key });
      client.setQueryData<VaultNote>(key, (prev) => (prev ? { ...prev, body } : prev));
    },
    // A newer edit may already be in the cache; keep its text and take the rest.
    onSuccess: (note) => {
      client.setQueryData<VaultNote>(key, (prev) => (prev && prev.body !== note.body ? { ...note, body: prev.body } : note));
      patchTree(client, (t) => ({ ...t, notes: t.notes.map((n) => (n.id === id ? summaryOf(note) : n)) }));
    },
    onError: (err) => notify(`Couldn't save a note: ${userMessageOf(err)} Your text is kept; open the note to retry.`),
  });
}

/** Renaming from the inline title or the explorer: tab titles and links follow the cache. */
export function useRenameNote(id: NoteId) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (title: string) => call("rename_note", { id, title }),
    onSuccess: (note) => putNote(client, note),
  });
}
