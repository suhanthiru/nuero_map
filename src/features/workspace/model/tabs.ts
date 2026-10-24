/** What a tab shows. Each tab keeps its own back/forward history of views. */
export type View =
  | { readonly kind: "today" }
  | { readonly kind: "graph"; readonly focusTopicId?: string; readonly edgeId?: string }
  | { readonly kind: "topic"; readonly topicId: string }
  /** One of the user's own notes (not a topic's). */
  | { readonly kind: "note"; readonly noteId: string }
  | { readonly kind: "import" }
  | { readonly kind: "settings" }
  | { readonly kind: "merges" }
  | { readonly kind: "review" };

export interface Tab {
  readonly id: string;
  readonly history: readonly View[];
  /** Index of the current view in `history`. */
  readonly index: number;
  /**
   * A pinned tab keeps what it shows: opening something from it goes to a new tab beside
   * it (Back and Forward still work), and it can't be closed until it's unpinned.
   */
  readonly pinned?: boolean;
}

export interface Workspace {
  readonly tabs: readonly Tab[];
  readonly activeId: string;
}

export interface OpenOptions {
  /** Open in a new tab instead of navigating the active one. */
  readonly newTab?: boolean;
  /** With newTab: open without switching to it. */
  readonly background?: boolean;
}

/** Screens that make sense once: opening them again focuses the existing tab. */
export const SINGLETONS: ReadonlySet<View["kind"]> = new Set(["today", "import", "settings", "merges", "review"]);

export function currentView(tab: Tab): View {
  return tab.history[tab.index];
}

export function sameView(a: View, b: View): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "topic" && b.kind === "topic") return a.topicId === b.topicId;
  if (a.kind === "note" && b.kind === "note") return a.noteId === b.noteId;
  return true;
}

/** Stable identity for a view: equal for views `sameView` calls the same. */
export function viewKey(view: View): string {
  if (view.kind === "topic") return `topic:${view.topicId}`;
  if (view.kind === "note") return `note:${view.noteId}`;
  return view.kind;
}

export function makeTab(id: string, view: View): Tab {
  return { id, history: [view], index: 0 };
}

export function initialWorkspace(newId: () => string): Workspace {
  const tab = makeTab(newId(), { kind: "today" });
  return { tabs: [tab], activeId: tab.id };
}

export function activeTab(ws: Workspace): Tab {
  return ws.tabs.find((t) => t.id === ws.activeId) ?? ws.tabs[0];
}

function replaceTab(ws: Workspace, tab: Tab): Workspace {
  return { ...ws, tabs: ws.tabs.map((t) => (t.id === tab.id ? tab : t)) };
}

/** Pushes a view onto a tab's history, dropping any forward entries. Pinned tabs stay put. */
export function navigateTab(ws: Workspace, tabId: string, view: View): Workspace {
  const tab = ws.tabs.find((t) => t.id === tabId);
  if (!tab || tab.pinned) return ws;
  if (sameView(currentView(tab), view) && view.kind !== "graph") return ws;
  const history = [...tab.history.slice(0, tab.index + 1), view];
  return replaceTab(ws, { ...tab, history, index: history.length - 1 });
}

export function openView(ws: Workspace, view: View, newId: () => string, opts: OpenOptions = {}): Workspace {
  if (SINGLETONS.has(view.kind) && !opts.newTab) {
    const existing = ws.tabs.find((t) => currentView(t).kind === view.kind);
    if (existing) return { ...ws, activeId: existing.id };
  }
  // A pinned tab can't navigate: opens go to a new tab beside it (but its own view just stays).
  const current = activeTab(ws);
  if (!opts.newTab && current.pinned && sameView(currentView(current), view) && view.kind !== "graph") return ws;
  if (opts.newTab || current.pinned) {
    const tab = makeTab(newId(), view);
    const at = ws.tabs.findIndex((t) => t.id === ws.activeId) + 1;
    const tabs = [...ws.tabs.slice(0, at), tab, ...ws.tabs.slice(at)];
    return { tabs, activeId: opts.background ? ws.activeId : tab.id };
  }
  return navigateTab(ws, ws.activeId, view);
}

export function goBack(ws: Workspace, tabId: string): Workspace {
  const tab = ws.tabs.find((t) => t.id === tabId);
  if (!tab || tab.index === 0) return ws;
  return replaceTab(ws, { ...tab, index: tab.index - 1 });
}

export function goForward(ws: Workspace, tabId: string): Workspace {
  const tab = ws.tabs.find((t) => t.id === tabId);
  if (!tab || tab.index >= tab.history.length - 1) return ws;
  return replaceTab(ws, { ...tab, index: tab.index + 1 });
}

export function isPinned(ws: Workspace, tabId: string): boolean {
  return ws.tabs.some((t) => t.id === tabId && t.pinned);
}

export function setPinned(ws: Workspace, tabId: string, pinned: boolean): Workspace {
  const tab = ws.tabs.find((t) => t.id === tabId);
  if (!tab || !!tab.pinned === pinned) return ws;
  const { pinned: _previous, ...unpinned } = tab;
  return replaceTab(ws, pinned ? { ...unpinned, pinned: true } : unpinned);
}

/**
 * Closing the active tab focuses its right neighbour (else left). The last tab becomes
 * Today. A pinned tab doesn't close.
 */
export function closeTab(ws: Workspace, tabId: string, newId: () => string): Workspace {
  return isPinned(ws, tabId) ? ws : removeTab(ws, tabId, newId);
}

/** Takes a tab out (pinned or not), e.g. when it moves to another pane. */
export function removeTab(ws: Workspace, tabId: string, newId: () => string): Workspace {
  const i = ws.tabs.findIndex((t) => t.id === tabId);
  if (i === -1) return ws;
  const tabs = ws.tabs.filter((t) => t.id !== tabId);
  if (tabs.length === 0) return initialWorkspace(newId);
  if (ws.activeId !== tabId) return { ...ws, tabs };
  const next = tabs[Math.min(i, tabs.length - 1)];
  return { tabs, activeId: next.id };
}

export function activate(ws: Workspace, tabId: string): Workspace {
  return ws.tabs.some((t) => t.id === tabId) ? { ...ws, activeId: tabId } : ws;
}

/** Ctrl+Tab style cycling. */
export function cycle(ws: Workspace, step: 1 | -1): Workspace {
  const i = ws.tabs.findIndex((t) => t.id === ws.activeId);
  const next = ws.tabs[(i + step + ws.tabs.length) % ws.tabs.length];
  return { ...ws, activeId: next.id };
}

export function moveTab(ws: Workspace, tabId: string, toIndex: number): Workspace {
  const from = ws.tabs.findIndex((t) => t.id === tabId);
  if (from === -1) return ws;
  const without = ws.tabs.filter((t) => t.id !== tabId);
  const clamped = Math.max(0, Math.min(toIndex, without.length));
  return { ...ws, tabs: [...without.slice(0, clamped), ws.tabs[from], ...without.slice(clamped)] };
}

/** Drops tabs whose current view `keep` rejects (a deleted note, say), keeping at least one. */
export function pruneViews(ws: Workspace, keep: (view: View) => boolean, newId: () => string): Workspace {
  const kept = ws.tabs.filter((t) => keep(currentView(t)));
  if (kept.length === ws.tabs.length) return ws;
  if (kept.length === 0) return initialWorkspace(newId);
  return { tabs: kept, activeId: kept.some((t) => t.id === ws.activeId) ? ws.activeId : kept[0].id };
}

/** Keeps every view except topics that are gone (e.g. merged away). */
export function topicsThatExist(exists: (topicId: string) => boolean): (view: View) => boolean {
  return (view) => view.kind !== "topic" || exists(view.topicId);
}

/** Drops tabs whose topic no longer exists (e.g. after a merge), keeping at least one. */
export function pruneTopics(ws: Workspace, exists: (topicId: string) => boolean, newId: () => string): Workspace {
  return pruneViews(ws, topicsThatExist(exists), newId);
}

const VIEW_KINDS: ReadonlySet<string> = new Set(["today", "graph", "topic", "note", "import", "settings", "merges", "review"]);

/** A view as read from storage: a known kind, with the id its kind needs. */
export function isWellFormedView(v: unknown): v is View {
  if (!v || typeof v !== "object") return false;
  const view = v as { kind?: unknown; topicId?: unknown; noteId?: unknown };
  if (typeof view.kind !== "string" || !VIEW_KINDS.has(view.kind)) return false;
  if (view.kind === "topic") return typeof view.topicId === "string";
  if (view.kind === "note") return typeof view.noteId === "string";
  return true;
}

/** Validates a workspace read from storage; anything unexpected falls back to a fresh one. */
export function restore(raw: unknown, newId: () => string): Workspace {
  const fresh = initialWorkspace(newId);
  if (!raw || typeof raw !== "object") return fresh;
  const ws = raw as Partial<Workspace>;
  if (!Array.isArray(ws.tabs) || ws.tabs.length === 0 || typeof ws.activeId !== "string") return fresh;
  const tabs = ws.tabs.filter(
    (t): t is Tab =>
      !!t &&
      typeof t.id === "string" &&
      Array.isArray(t.history) &&
      t.history.length > 0 &&
      t.history.every(isWellFormedView) &&
      Number.isInteger(t.index) &&
      t.index >= 0 &&
      t.index < t.history.length,
  );
  if (tabs.length === 0) return fresh;
  // Keep `pinned` only when it is exactly true; anything else in storage means unpinned.
  const clean = tabs.map(({ pinned, ...tab }) => (pinned === true ? { ...tab, pinned: true } : tab));
  return { tabs: clean, activeId: clean.some((t) => t.id === ws.activeId) ? ws.activeId : clean[0].id };
}
