import { create } from "zustand";
import type { FolderId, NoteId } from "../../api/contract";
import { NOTE_SORTS, type NoteSort } from "./model/tree";

const STORAGE_KEY = "neural-map.notes-explorer";

/** A row in the notes explorer. */
export type VaultItem = { readonly kind: "folder"; readonly id: FolderId } | { readonly kind: "note"; readonly id: NoteId };

export function sameItem(a: VaultItem | null, b: VaultItem | null): boolean {
  return !!a && !!b && a.kind === b.kind && a.id === b.id;
}

interface Persisted {
  readonly sort: NoteSort;
  /** Folders the user opened. Folders start closed, as in a notes app. */
  readonly expanded: readonly FolderId[];
}

interface VaultUiState extends Persisted {
  /** The row showing a name field instead of its name. */
  readonly renaming: VaultItem | null;
  /** Set by "reveal active note"; the explorer scrolls to and focuses that row, then clears it. */
  readonly revealPending: boolean;
  /** A note just created: its page focuses and selects the title once, then clears this. */
  readonly freshNoteId: NoteId | null;
  /** Open dialogs. */
  readonly moving: VaultItem | null;
  readonly deleting: VaultItem | null;
  /** The import dialog, and the folder it imports into (null = top level). */
  readonly importInto: { readonly folderId: FolderId | null } | null;
  setSort: (sort: NoteSort) => void;
  toggleFolder: (id: FolderId) => void;
  expand: (ids: readonly FolderId[]) => void;
  collapseAll: () => void;
  setRenaming: (item: VaultItem | null) => void;
  requestReveal: () => void;
  revealDone: () => void;
  setFreshNote: (id: NoteId | null) => void;
  setMoving: (item: VaultItem | null) => void;
  setDeleting: (item: VaultItem | null) => void;
  setImportInto: (target: { readonly folderId: FolderId | null } | null) => void;
}

const DEFAULTS: Persisted = { sort: "name", expanded: [] };

function load(): Persisted {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<Persisted> | null;
    if (!parsed) return DEFAULTS;
    return {
      sort: NOTE_SORTS.includes(parsed.sort as NoteSort) ? (parsed.sort as NoteSort) : DEFAULTS.sort,
      expanded: Array.isArray(parsed.expanded) ? parsed.expanded.filter((id): id is string => typeof id === "string") : DEFAULTS.expanded,
    };
  } catch {
    return DEFAULTS;
  }
}

const TRANSIENT = { renaming: null, revealPending: false, freshNoteId: null, moving: null, deleting: null, importInto: null } as const;

export const useVaultUi = create<VaultUiState>((set) => ({
  ...load(),
  ...TRANSIENT,
  setSort: (sort) => set({ sort }),
  toggleFolder: (id) => set((s) => ({ expanded: s.expanded.includes(id) ? s.expanded.filter((e) => e !== id) : [...s.expanded, id] })),
  expand: (ids) =>
    set((s) => {
      const missing = ids.filter((id) => !s.expanded.includes(id));
      return missing.length ? { expanded: [...s.expanded, ...missing] } : s;
    }),
  collapseAll: () => set({ expanded: [] }),
  setRenaming: (renaming) => set({ renaming }),
  requestReveal: () => set({ revealPending: true }),
  revealDone: () => set({ revealPending: false }),
  setFreshNote: (freshNoteId) => set({ freshNoteId }),
  // One dialog at a time.
  setMoving: (moving) => set(moving ? { moving, deleting: null, importInto: null } : { moving }),
  setDeleting: (deleting) => set(deleting ? { deleting, moving: null, importInto: null } : { deleting }),
  setImportInto: (importInto) => set(importInto ? { importInto, moving: null, deleting: null } : { importInto }),
}));

useVaultUi.subscribe((s, prev) => {
  if (s.sort === prev.sort && s.expanded === prev.expanded) return;
  try {
    const persisted: Persisted = { sort: s.sort, expanded: s.expanded };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
  } catch {
    // Storage unavailable: the explorer just won't remember open folders.
  }
});

export function resetVaultUi(): void {
  useVaultUi.setState({ ...DEFAULTS, ...TRANSIENT });
}

/** Any vault dialog is open (it owns the keyboard, like the quick switcher). */
export function vaultDialogOpen(): boolean {
  const s = useVaultUi.getState();
  return !!(s.moving || s.deleting || s.importInto);
}
