import { create } from "zustand";

/** Like a notes app: reading view renders the note, editing view shows its markdown. */
export type NoteMode = "reading" | "editing";

interface NoteModeState {
  /** Per tab, so the same topic can be read in one tab and edited in another. */
  readonly modes: Readonly<Record<string, NoteMode>>;
  setMode: (tabId: string, mode: NoteMode) => void;
  toggle: (tabId: string) => void;
}

export const DEFAULT_NOTE_MODE: NoteMode = "reading";

export const useNoteModes = create<NoteModeState>((set) => ({
  modes: {},
  setMode: (tabId, mode) => set((s) => ({ modes: { ...s.modes, [tabId]: mode } })),
  toggle: (tabId) =>
    set((s) => ({ modes: { ...s.modes, [tabId]: (s.modes[tabId] ?? DEFAULT_NOTE_MODE) === "reading" ? "editing" : "reading" } })),
}));

export function useNoteMode(tabId: string): NoteMode {
  return useNoteModes((s) => s.modes[tabId] ?? DEFAULT_NOTE_MODE);
}
