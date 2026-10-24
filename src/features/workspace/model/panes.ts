import {
  activate,
  activeTab,
  closeTab,
  currentView,
  goBack,
  goForward,
  initialWorkspace,
  makeTab,
  openView,
  pruneViews,
  removeTab,
  restore,
  setPinned,
  SINGLETONS,
  topicsThatExist,
  type OpenOptions,
  type Tab,
  type View,
  type Workspace,
} from "./tabs";

/** One side-by-side editor pane: its own tabs, each with its own history. */
export interface Pane {
  readonly id: string;
  readonly ws: Workspace;
  /** Share of the main area's width; all panes sum to 1. */
  readonly size: number;
}

export interface Layout {
  readonly panes: readonly Pane[];
  readonly activePaneId: string;
}

export interface LayoutOpenOptions extends OpenOptions {
  /** Open in the pane to the right of the active one, splitting if there is none. */
  readonly toRight?: boolean;
}

/** A pane can't be dragged narrower than this share of the main area. */
export const MIN_PANE_SIZE = 0.15;
export const MAX_PANES = 4;

export function initialLayout(newId: () => string): Layout {
  const pane: Pane = { id: `pane-${newId()}`, ws: initialWorkspace(newId), size: 1 };
  return { panes: [pane], activePaneId: pane.id };
}

export function activePane(layout: Layout): Pane {
  return layout.panes.find((p) => p.id === layout.activePaneId) ?? layout.panes[0];
}

export function paneOfTab(layout: Layout, tabId: string): Pane | undefined {
  return layout.panes.find((p) => p.ws.tabs.some((t) => t.id === tabId));
}

export function allTabs(layout: Layout): readonly Tab[] {
  return layout.panes.flatMap((p) => p.ws.tabs);
}

/** The tab the user is looking at: the active pane's active tab. */
export function focusedTab(layout: Layout): Tab {
  return activeTab(activePane(layout).ws);
}

/** The view the user is looking at: the active pane's active tab. */
export function focusedView(layout: Layout): View {
  return currentView(focusedTab(layout));
}

/**
 * The tab the right sidebar describes: the focused pane's tab when it shows a topic,
 * else a topic showing in another pane (so focusing the graph beside a note keeps that
 * note's connections and outline in view, as a notes app does).
 */
export function sidebarTopicTab(layout: Layout): Tab | null {
  const focused = activeTab(activePane(layout).ws);
  if (currentView(focused).kind === "topic") return focused;
  for (const pane of layout.panes) {
    const tab = activeTab(pane.ws);
    if (currentView(tab).kind === "topic") return tab;
  }
  return null;
}

function replacePane(layout: Layout, pane: Pane): Layout {
  return { ...layout, panes: layout.panes.map((p) => (p.id === pane.id ? pane : p)) };
}

export function withPaneWs(layout: Layout, paneId: string, fn: (ws: Workspace) => Workspace): Layout {
  const pane = layout.panes.find((p) => p.id === paneId);
  if (!pane) return layout;
  const ws = fn(pane.ws);
  return ws === pane.ws ? layout : replacePane(layout, { ...pane, ws });
}

export function focusPane(layout: Layout, paneId: string): Layout {
  return layout.activePaneId !== paneId && layout.panes.some((p) => p.id === paneId) ? { ...layout, activePaneId: paneId } : layout;
}

/** Focuses a tab wherever it lives. */
export function activateTab(layout: Layout, tabId: string): Layout {
  const pane = paneOfTab(layout, tabId);
  if (!pane) return layout;
  return focusPane(withPaneWs(layout, pane.id, (ws) => activate(ws, tabId)), pane.id);
}

/** Inserts a pane to the right of `afterId`, taking half of that pane's width. */
function insertPane(layout: Layout, afterId: string, ws: Workspace, newId: () => string): Layout {
  const at = layout.panes.findIndex((p) => p.id === afterId);
  if (at === -1) return layout;
  const source = layout.panes[at];
  const half = source.size / 2;
  const pane: Pane = { id: `pane-${newId()}`, ws, size: half };
  const panes = [...layout.panes.slice(0, at), { ...source, size: half }, pane, ...layout.panes.slice(at + 1)];
  // Halving a narrow pane would go under the minimum width: share the row equally instead.
  const fits = half >= MIN_PANE_SIZE;
  return { panes: fits ? panes : panes.map((p) => ({ ...p, size: 1 / panes.length })), activePaneId: pane.id };
}

/** Opens `view` (default: the pane's current view) in a new pane to the right of `paneId`. */
export function splitRight(layout: Layout, paneId: string, newId: () => string, view?: View): Layout {
  const pane = layout.panes.find((p) => p.id === paneId);
  if (!pane || layout.panes.length >= MAX_PANES) return layout;
  const tab = makeTab(newId(), view ?? currentView(activeTab(pane.ws)));
  return insertPane(layout, paneId, { tabs: [tab], activeId: tab.id }, newId);
}

function findSingleton(layout: Layout, kind: View["kind"]): { pane: Pane; tab: Tab } | undefined {
  for (const pane of layout.panes) {
    const tab = pane.ws.tabs.find((t) => currentView(t).kind === kind);
    if (tab) return { pane, tab };
  }
  return undefined;
}

/**
 * Opens a view in the active pane. Singleton screens (Today, Settings…) focus their
 * existing tab in any pane; `toRight` targets the next pane, splitting if needed.
 */
export function openInLayout(layout: Layout, view: View, newId: () => string, opts: LayoutOpenOptions = {}): Layout {
  if (opts.toRight) {
    const at = layout.panes.findIndex((p) => p.id === layout.activePaneId);
    const next = layout.panes[at + 1];
    if (!next) {
      const split = splitRight(layout, layout.activePaneId, newId, view);
      return split === layout ? openInLayout(layout, view, newId, { newTab: true }) : split;
    }
    return focusPane(withPaneWs(layout, next.id, (ws) => openView(ws, view, newId, { newTab: true })), next.id);
  }
  if (SINGLETONS.has(view.kind) && !opts.newTab) {
    const found = findSingleton(layout, view.kind);
    if (found) return activateTab(layout, found.tab.id);
  }
  return withPaneWs(layout, layout.activePaneId, (ws) => openView(ws, view, newId, opts));
}

/** Removes a pane, giving its width to the neighbour that takes focus. Keeps at least one. */
export function closePane(layout: Layout, paneId: string): Layout {
  const at = layout.panes.findIndex((p) => p.id === paneId);
  if (at === -1 || layout.panes.length === 1) return layout;
  const heirIndex = at > 0 ? at - 1 : 1;
  const heir = layout.panes[heirIndex];
  const size = heir.size + layout.panes[at].size;
  const panes = layout.panes.filter((p) => p.id !== paneId).map((p) => (p.id === heir.id ? { ...p, size } : p));
  const activePaneId = layout.activePaneId === paneId ? heir.id : layout.activePaneId;
  return { panes, activePaneId };
}

/** Closing a pane's last tab closes the pane, unless it is the only one. Pinned tabs don't close. */
export function closeTabIn(layout: Layout, tabId: string, newId: () => string): Layout {
  const pane = paneOfTab(layout, tabId);
  if (!pane || pane.ws.tabs.some((t) => t.id === tabId && t.pinned)) return layout;
  if (pane.ws.tabs.length === 1 && layout.panes.length > 1) return closePane(layout, pane.id);
  return withPaneWs(layout, pane.id, (ws) => closeTab(ws, tabId, newId));
}

/** Keeps only `tabId` (and any pinned tabs) in its pane. */
export function closeOthers(layout: Layout, tabId: string): Layout {
  const pane = paneOfTab(layout, tabId);
  if (!pane) return layout;
  return withPaneWs(layout, pane.id, (ws) => ({ tabs: ws.tabs.filter((t) => t.id === tabId || t.pinned), activeId: tabId }));
}

/** Closes the tabs after `tabId` in its pane, except pinned ones. */
export function closeToRight(layout: Layout, tabId: string): Layout {
  const pane = paneOfTab(layout, tabId);
  if (!pane) return layout;
  return withPaneWs(layout, pane.id, (ws) => {
    const at = ws.tabs.findIndex((t) => t.id === tabId);
    const tabs = ws.tabs.filter((t, i) => i <= at || t.pinned);
    return { tabs, activeId: tabs.some((t) => t.id === ws.activeId) ? ws.activeId : tabId };
  });
}

export function togglePin(layout: Layout, tabId: string): Layout {
  const pane = paneOfTab(layout, tabId);
  if (!pane) return layout;
  return withPaneWs(layout, pane.id, (ws) => setPinned(ws, tabId, !ws.tabs.find((t) => t.id === tabId)?.pinned));
}

export function backIn(layout: Layout, tabId: string): Layout {
  const pane = paneOfTab(layout, tabId);
  return pane ? withPaneWs(layout, pane.id, (ws) => goBack(ws, tabId)) : layout;
}

export function forwardIn(layout: Layout, tabId: string): Layout {
  const pane = paneOfTab(layout, tabId);
  return pane ? withPaneWs(layout, pane.id, (ws) => goForward(ws, tabId)) : layout;
}

/** Moves a tab to `toIndex` in `toPaneId` (the same pane reorders). An emptied pane closes. */
export function moveTabTo(layout: Layout, tabId: string, toPaneId: string, toIndex: number, newId: () => string): Layout {
  const from = paneOfTab(layout, tabId);
  const to = layout.panes.find((p) => p.id === toPaneId);
  if (!from || !to) return layout;
  const tab = from.ws.tabs.find((t) => t.id === tabId) as Tab;
  const insert = (tabs: readonly Tab[]) => {
    const clamped = Math.max(0, Math.min(toIndex, tabs.length));
    return [...tabs.slice(0, clamped), tab, ...tabs.slice(clamped)];
  };
  if (from.id === to.id) {
    return withPaneWs(layout, from.id, (ws) => ({ ...ws, tabs: insert(ws.tabs.filter((t) => t.id !== tabId)) }));
  }
  const target = withPaneWs(layout, to.id, (ws) => ({ tabs: insert(ws.tabs), activeId: tabId }));
  const emptied = from.ws.tabs.length === 1;
  const removed = emptied ? closePane(target, from.id) : withPaneWs(target, from.id, (ws) => removeTab(ws, tabId, newId));
  return focusPane(removed, to.id);
}

/** Sets the width share of pane `index` against its right neighbour, keeping both above the minimum. */
export function resizePane(layout: Layout, index: number, size: number): Layout {
  const left = layout.panes[index];
  const right = layout.panes[index + 1];
  if (!left || !right) return layout;
  const pair = left.size + right.size;
  const next = Math.max(MIN_PANE_SIZE, Math.min(pair - MIN_PANE_SIZE, size));
  if (Math.abs(next - left.size) < 1e-6) return layout;
  const panes = layout.panes.map((p, i) => (i === index ? { ...p, size: next } : i === index + 1 ? { ...p, size: pair - next } : p));
  return { ...layout, panes };
}

/** Drops tabs whose view `keep` rejects in every pane, closing panes left empty. */
export function pruneLayoutViews(layout: Layout, keep: (view: View) => boolean, newId: () => string): Layout {
  let next = layout;
  for (const pane of layout.panes) {
    const survivors = pane.ws.tabs.filter((t) => keep(currentView(t)));
    if (survivors.length === 0 && next.panes.length > 1) next = closePane(next, pane.id);
    else next = withPaneWs(next, pane.id, (ws) => pruneViews(ws, keep, newId));
  }
  return next;
}

/** Drops tabs whose topic no longer exists in every pane, closing panes left empty. */
export function pruneLayout(layout: Layout, exists: (topicId: string) => boolean, newId: () => string): Layout {
  return pruneLayoutViews(layout, topicsThatExist(exists), newId);
}

function normalizeSizes(panes: readonly Pane[]): Pane[] {
  const total = panes.reduce((n, p) => n + p.size, 0);
  return panes.map((p) => ({ ...p, size: p.size / total }));
}

/**
 * Validates a layout read from storage. A saved single-pane workspace (`legacyWs`, the
 * format before split panes) becomes a one-pane layout; anything else unexpected starts fresh.
 */
export function restoreLayout(raw: unknown, newId: () => string, legacyWs?: unknown): Layout {
  if (raw && typeof raw === "object" && Array.isArray((raw as Layout).panes)) {
    const saved = raw as Layout;
    const panes = saved.panes
      .filter((p): p is Pane => !!p && typeof p.id === "string" && typeof p.size === "number" && p.size > 0 && Number.isFinite(p.size))
      .map((p) => ({ ...p, ws: restore(p.ws, newId) }))
      .slice(0, MAX_PANES);
    if (panes.length > 0) {
      const activePaneId = panes.some((p) => p.id === saved.activePaneId) ? saved.activePaneId : panes[0].id;
      return { panes: normalizeSizes(panes), activePaneId };
    }
  }
  if (legacyWs !== undefined) {
    const pane: Pane = { id: `pane-${newId()}`, ws: restore(legacyWs, newId), size: 1 };
    return { panes: [pane], activePaneId: pane.id };
  }
  return initialLayout(newId);
}
