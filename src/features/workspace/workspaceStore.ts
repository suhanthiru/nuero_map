import { create } from "zustand";
import { resetExplorer } from "./explorerStore";
import { removeBookmark, restoreBookmarks, toggleBookmark } from "./model/bookmarks";
import {
  activateTab,
  activePane,
  backIn,
  closeOthers,
  closeTabIn,
  closeToRight,
  focusPane,
  forwardIn,
  initialLayout,
  moveTabTo,
  openInLayout,
  paneOfTab,
  pruneLayout,
  pruneLayoutViews,
  resizePane,
  restoreLayout,
  splitRight,
  togglePin,
  withPaneWs,
  type Layout,
  type LayoutOpenOptions,
} from "./model/panes";
import { currentView, cycle, type View, type Workspace } from "./model/tabs";

const STORAGE_KEY = "neural-map.workspace";

export type LeftPane = "topics" | "notes" | "search" | "bookmarks";
export type RightPane = "connections" | "local-graph" | "outline";

const LEFT_PANES: readonly LeftPane[] = ["topics", "notes", "search", "bookmarks"];
const RIGHT_PANES: readonly RightPane[] = ["connections", "local-graph", "outline"];

let counter = 0;
const newId = () => `tab-${Date.now().toString(36)}-${(counter++).toString(36)}`;

interface Persisted {
  readonly layout: Layout;
  readonly leftOpen: boolean;
  readonly rightOpen: boolean;
  readonly leftPane: LeftPane;
  readonly rightPane: RightPane;
  /** Newest first. */
  readonly bookmarks: readonly View[];
}

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function load(): Persisted {
  const fallback: Persisted = {
    layout: initialLayout(newId),
    leftOpen: true,
    rightOpen: true,
    leftPane: "topics",
    rightPane: "connections",
    bookmarks: [],
  };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<Persisted> & { ws?: unknown };
    return {
      layout: restoreLayout(parsed.layout, newId, parsed.ws),
      leftOpen: parsed.leftOpen ?? true,
      rightOpen: parsed.rightOpen ?? true,
      leftPane: pick(parsed.leftPane, LEFT_PANES, "topics"),
      rightPane: pick(parsed.rightPane, RIGHT_PANES, "connections"),
      bookmarks: restoreBookmarks(parsed.bookmarks),
    };
  } catch {
    return fallback;
  }
}

interface WorkspaceState extends Persisted {
  /** The active pane's tabs. Kept in step with `layout` for code that only cares about the focused pane. */
  readonly ws: Workspace;
  readonly switcherOpen: boolean;
  readonly paletteOpen: boolean;
  readonly shortcutsOpen: boolean;
  /** Opens in the active pane (see LayoutOpenOptions for new tab / to the right). */
  open: (view: View, opts?: LayoutOpenOptions) => void;
  close: (tabId: string) => void;
  closeOthers: (tabId: string) => void;
  closeToRight: (tabId: string) => void;
  /** Pinned tabs keep what they show and don't close (see `Tab.pinned`). */
  togglePin: (tabId: string) => void;
  activate: (tabId: string) => void;
  back: (tabId: string) => void;
  forward: (tabId: string) => void;
  /** Ctrl+Tab within the active pane. */
  cycle: (step: 1 | -1) => void;
  /** Reorders within the tab's pane. */
  move: (tabId: string, toIndex: number) => void;
  moveToPane: (tabId: string, paneId: string, toIndex: number) => void;
  /** Splits the pane holding `tabId` (default: the active tab), showing that tab's view on the right. */
  splitRight: (tabId?: string) => void;
  focusPane: (paneId: string) => void;
  resizePane: (index: number, size: number) => void;
  /** Closes tabs whose topic no longer exists (merged away or deleted). */
  pruneTopics: (exists: (topicId: string) => boolean) => void;
  /** Closes tabs (and drops bookmarks) whose view `keep` rejects, e.g. notes just deleted. */
  pruneViews: (keep: (view: View) => boolean) => void;
  setWorkspace: (ws: Workspace) => void;
  toggleLeft: () => void;
  toggleRight: () => void;
  setLeftPane: (pane: LeftPane) => void;
  setRightPane: (pane: RightPane) => void;
  setSwitcherOpen: (open: boolean) => void;
  setPaletteOpen: (open: boolean) => void;
  setShortcutsOpen: (open: boolean) => void;
  toggleBookmark: (view: View) => void;
  removeBookmark: (view: View) => void;
}

/** Every layout change goes through here so `ws` never drifts from the active pane. */
function withLayout(layout: Layout): Pick<WorkspaceState, "layout" | "ws"> {
  return { layout, ws: activePane(layout).ws };
}

const initial = load();
const NO_MODAL = { switcherOpen: false, paletteOpen: false, shortcutsOpen: false } as const;

export const useWorkspace = create<WorkspaceState>((set) => {
  const update = (fn: (layout: Layout) => Layout) => set((s) => withLayout(fn(s.layout)));
  return {
    ...initial,
    ws: activePane(initial.layout).ws,
    ...NO_MODAL,
    open: (view, opts) => update((l) => openInLayout(l, view, newId, opts)),
    close: (tabId) => update((l) => closeTabIn(l, tabId, newId)),
    closeOthers: (tabId) => update((l) => activateTab(closeOthers(l, tabId), tabId)),
    closeToRight: (tabId) => update((l) => closeToRight(l, tabId)),
    togglePin: (tabId) => update((l) => togglePin(l, tabId)),
    activate: (tabId) => update((l) => activateTab(l, tabId)),
    back: (tabId) => update((l) => backIn(l, tabId)),
    forward: (tabId) => update((l) => forwardIn(l, tabId)),
    cycle: (step) => update((l) => withPaneWs(l, l.activePaneId, (ws) => cycle(ws, step))),
    move: (tabId, toIndex) =>
      update((l) => {
        const pane = paneOfTab(l, tabId);
        return pane ? moveTabTo(l, tabId, pane.id, toIndex, newId) : l;
      }),
    moveToPane: (tabId, paneId, toIndex) => update((l) => moveTabTo(l, tabId, paneId, toIndex, newId)),
    splitRight: (tabId) =>
      update((l) => {
        const pane = tabId ? paneOfTab(l, tabId) : activePane(l);
        const tab = pane?.ws.tabs.find((t) => t.id === (tabId ?? pane.ws.activeId));
        return pane && tab ? splitRight(l, pane.id, newId, currentView(tab)) : l;
      }),
    focusPane: (paneId) => update((l) => focusPane(l, paneId)),
    resizePane: (index, size) => update((l) => resizePane(l, index, size)),
    pruneTopics: (exists) => update((l) => pruneLayout(l, exists, newId)),
    pruneViews: (keep) =>
      set((s) => {
        const bookmarks = s.bookmarks.filter(keep);
        return { ...withLayout(pruneLayoutViews(s.layout, keep, newId)), bookmarks: bookmarks.length === s.bookmarks.length ? s.bookmarks : bookmarks };
      }),
    setWorkspace: (ws) => update((l) => withPaneWs(l, l.activePaneId, () => ws)),
    toggleLeft: () => set((s) => ({ leftOpen: !s.leftOpen })),
    toggleRight: () => set((s) => ({ rightOpen: !s.rightOpen })),
    setLeftPane: (leftPane) => set({ leftPane, leftOpen: true }),
    setRightPane: (rightPane) => set({ rightPane, rightOpen: true }),
    // One modal at a time: opening one closes the others.
    setSwitcherOpen: (switcherOpen) => set(switcherOpen ? { ...NO_MODAL, switcherOpen } : { switcherOpen }),
    setPaletteOpen: (paletteOpen) => set(paletteOpen ? { ...NO_MODAL, paletteOpen } : { paletteOpen }),
    setShortcutsOpen: (shortcutsOpen) => set(shortcutsOpen ? { ...NO_MODAL, shortcutsOpen } : { shortcutsOpen }),
    toggleBookmark: (view) => set((s) => ({ bookmarks: toggleBookmark(s.bookmarks, view) })),
    removeBookmark: (view) => set((s) => ({ bookmarks: removeBookmark(s.bookmarks, view) })),
  };
});

useWorkspace.subscribe((s, prev) => {
  // Opening a dialog or menu changes the store too; only write when something saved changed.
  const unchanged =
    s.layout === prev.layout &&
    s.leftOpen === prev.leftOpen &&
    s.rightOpen === prev.rightOpen &&
    s.leftPane === prev.leftPane &&
    s.rightPane === prev.rightPane &&
    s.bookmarks === prev.bookmarks;
  if (unchanged) return;
  try {
    const persisted: Persisted = {
      layout: s.layout,
      leftOpen: s.leftOpen,
      rightOpen: s.rightOpen,
      leftPane: s.leftPane,
      rightPane: s.rightPane,
      bookmarks: s.bookmarks,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
  } catch {
    // Storage unavailable: tabs just won't survive a restart.
  }
});

/** Tests and "reset layout": back to a single pane with one tab showing `view`. */
export function resetWorkspace(view: View = { kind: "today" }): void {
  resetExplorer();
  const layout = openInLayout(initialLayout(newId), view, newId);
  useWorkspace.setState({
    ...withLayout(layout),
    leftOpen: true,
    rightOpen: true,
    leftPane: "topics",
    rightPane: "connections",
    bookmarks: [],
    ...NO_MODAL,
  });
}

/** Test hook: re-read persisted state, as a restart would. */
export function reloadWorkspace(): void {
  const loaded = load();
  useWorkspace.setState({ ...loaded, ws: activePane(loaded.layout).ws });
}
