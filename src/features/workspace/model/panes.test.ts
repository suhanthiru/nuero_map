import { describe, expect, it } from "vitest";
import {
  activateTab,
  activePane,
  closeOthers,
  closePane,
  closeTabIn,
  closeToRight,
  focusedView,
  initialLayout,
  MIN_PANE_SIZE,
  moveTabTo,
  openInLayout,
  pruneLayout,
  resizePane,
  restoreLayout,
  sidebarTopicTab,
  splitRight,
  togglePin,
  type Layout,
} from "./panes";
import { currentView, initialWorkspace, openView } from "./tabs";

function ids() {
  let n = 0;
  return () => `t${++n}`;
}

const topic = (topicId: string) => ({ kind: "topic" as const, topicId });
const views = (layout: Layout) => layout.panes.map((p) => p.ws.tabs.map((t) => currentView(t)));

describe("panes", () => {
  it("starts with one pane holding a Today tab", () => {
    const layout = initialLayout(ids());
    expect(layout.panes).toHaveLength(1);
    expect(layout.panes[0].size).toBe(1);
    expect(focusedView(layout)).toEqual({ kind: "today" });
  });

  it("keeps the sidebar on a visible topic while the graph beside it is focused", () => {
    const newId = ids();
    let layout = openInLayout(initialLayout(newId), topic("a"), newId);
    layout = splitRight(layout, layout.activePaneId, newId, { kind: "graph" });

    expect(focusedView(layout)).toEqual({ kind: "graph" });
    expect(currentView(sidebarTopicTab(layout)!)).toEqual(topic("a"));
    expect(sidebarTopicTab(initialLayout(newId))).toBeNull();
  });

  it("never splits a pane below the minimum width", () => {
    const newId = ids();
    let layout = initialLayout(newId);
    for (let i = 0; i < 3; i++) layout = splitRight(layout, layout.activePaneId, newId);

    expect(layout.panes).toHaveLength(4);
    expect(Math.min(...layout.panes.map((p) => p.size))).toBeGreaterThanOrEqual(MIN_PANE_SIZE);
    expect(layout.panes.reduce((n, p) => n + p.size, 0)).toBeCloseTo(1);
  });

  it("splits right with the current view, halving the width and focusing the new pane", () => {
    const newId = ids();
    let layout = openInLayout(initialLayout(newId), topic("a"), newId);
    const left = layout.activePaneId;

    layout = splitRight(layout, left, newId);

    expect(layout.panes).toHaveLength(2);
    expect(layout.activePaneId).not.toBe(left);
    expect(layout.panes.map((p) => p.size)).toEqual([0.5, 0.5]);
    expect(views(layout)).toEqual([[topic("a")], [topic("a")]]);
  });

  it("opens into the active pane, and Ctrl+Alt style opens go to the next pane", () => {
    const newId = ids();
    let layout = initialLayout(newId);
    layout = openInLayout(layout, topic("a"), newId, { toRight: true });
    expect(views(layout)).toEqual([[{ kind: "today" }], [topic("a")]]);

    layout = activateTab(layout, layout.panes[0].ws.tabs[0].id);
    layout = openInLayout(layout, topic("b"), newId, { toRight: true });
    expect(layout.panes).toHaveLength(2);
    expect(views(layout)[1]).toEqual([topic("a"), topic("b")]);
    expect(layout.activePaneId).toBe(layout.panes[1].id);
  });

  it("focuses an open singleton in another pane instead of duplicating it", () => {
    const newId = ids();
    let layout = openInLayout(initialLayout(newId), { kind: "settings" }, newId, { toRight: true });
    layout = activateTab(layout, layout.panes[0].ws.tabs[0].id);

    layout = openInLayout(layout, { kind: "settings" }, newId);

    expect(layout.activePaneId).toBe(layout.panes[1].id);
    expect(views(layout)).toEqual([[{ kind: "today" }], [{ kind: "settings" }]]);
  });

  it("closes a pane with its last tab and gives its width to the neighbour", () => {
    const newId = ids();
    const first = initialLayout(newId);
    let layout = splitRight(splitRight(first, first.activePaneId, newId), first.activePaneId, newId);
    expect(layout.panes).toHaveLength(3);
    layout = closeTabIn(layout, activePane(layout).ws.tabs[0].id, newId);
    expect(layout.panes).toHaveLength(2);
    const onlyTab = activePane(layout).ws.tabs[0].id;

    layout = closeTabIn(layout, onlyTab, newId);

    expect(layout.panes).toHaveLength(1);
    expect(layout.panes[0].size).toBe(1);
    expect(closePane(layout, layout.panes[0].id)).toBe(layout);
    // The only pane's last tab turns back into Today rather than vanishing.
    expect(views(closeTabIn(layout, layout.panes[0].ws.tabs[0].id, newId))).toEqual([[{ kind: "today" }]]);
  });

  it("closes the other tabs, or the ones to the right, in a pane", () => {
    const newId = ids();
    let layout = initialLayout(newId);
    for (const id of ["a", "b", "c"]) layout = openInLayout(layout, topic(id), newId, { newTab: true });
    const [, a, b] = layout.panes[0].ws.tabs.map((t) => t.id);

    expect(views(closeOthers(layout, b))).toEqual([[topic("b")]]);
    const right = closeToRight(layout, a);
    expect(views(right)).toEqual([[{ kind: "today" }, topic("a")]]);
    expect(right.panes[0].ws.activeId).toBe(a);
  });

  it("moves a tab into another pane and closes the pane it left empty", () => {
    const newId = ids();
    const first = openInLayout(initialLayout(newId), topic("a"), newId);
    let layout = splitRight(first, first.activePaneId, newId);
    const [left, right] = layout.panes;
    const moving = right.ws.tabs[0].id;

    layout = moveTabTo(layout, moving, left.id, 0, newId);

    expect(layout.panes).toHaveLength(1);
    expect(layout.panes[0].ws.tabs[0].id).toBe(moving);
    expect(layout.panes[0].ws.activeId).toBe(moving);
  });

  it("resizes neighbours without letting either drop below the minimum", () => {
    const newId = ids();
    const first = initialLayout(newId);
    const layout = splitRight(first, first.activePaneId, newId);

    expect(resizePane(layout, 0, 0.7).panes.map((p) => p.size)).toEqual([0.7, expect.closeTo(0.3)]);
    expect(resizePane(layout, 0, 0.99).panes[1].size).toBeCloseTo(MIN_PANE_SIZE);
    expect(resizePane(layout, 1, 0.4)).toBe(layout);
  });

  it("prunes tabs for deleted topics across panes", () => {
    const newId = ids();
    const first = initialLayout(newId);
    const layout = splitRight(openInLayout(first, topic("gone"), newId), first.activePaneId, newId);

    const pruned = pruneLayout(layout, (id) => id !== "gone", newId);

    expect(views(pruned)).toEqual([[{ kind: "today" }]]);
  });

  it("restores a saved layout, migrates the old single-pane format, and rejects garbage", () => {
    const newId = ids();
    const first = initialLayout(newId);
    const saved = splitRight(first, first.activePaneId, newId);
    expect(restoreLayout(JSON.parse(JSON.stringify(saved)), newId)).toEqual(saved);

    const legacy = openView(initialWorkspace(newId), topic("a"), newId, { newTab: true });
    const migrated = restoreLayout(undefined, newId, legacy);
    expect(migrated.panes).toHaveLength(1);
    expect(migrated.panes[0].ws).toEqual(legacy);

    expect(restoreLayout({ panes: [{ id: 3 }] }, newId).panes).toHaveLength(1);
    expect(restoreLayout(null, newId).panes[0].size).toBe(1);
    const skewed = restoreLayout({ panes: saved.panes.map((p) => ({ ...p, size: 3 })), activePaneId: "nope" }, newId);
    expect(skewed.panes.map((p) => p.size)).toEqual([0.5, 0.5]);
    expect(skewed.activePaneId).toBe(saved.panes[0].id);
  });

  describe("pinned tabs", () => {
    function threeTabs() {
      const newId = ids();
      let layout = initialLayout(newId);
      layout = openInLayout(layout, topic("a"), newId, { newTab: true });
      layout = openInLayout(layout, topic("b"), newId, { newTab: true });
      const [today, a, b] = layout.panes[0].ws.tabs.map((t) => t.id);
      return { layout, newId, today, a, b };
    }

    it("survives Close, Close others and Close tabs to the right", () => {
      const { layout, newId, today, a, b } = threeTabs();
      const pinned = togglePin(togglePin(layout, a), b);

      expect(closeTabIn(pinned, a, newId)).toBe(pinned);
      expect(closeOthers(pinned, today).panes[0].ws.tabs.map((t) => t.id)).toEqual([today, a, b]);
      const unpinnedB = togglePin(pinned, b);
      expect(closeToRight(unpinnedB, today).panes[0].ws.tabs.map((t) => t.id)).toEqual([today, a]);
    });

    it("moves to another pane without leaving a copy, and splits into an unpinned tab", () => {
      const { layout, newId, a } = threeTabs();
      const pinned = togglePin(activateTab(layout, a), a);
      const split = splitRight(pinned, pinned.activePaneId, newId);

      expect(split.panes[1].ws.tabs[0].pinned).toBeUndefined();
      const moved = moveTabTo(split, a, split.panes[1].id, 0, newId);
      expect(moved.panes[0].ws.tabs.some((t) => t.id === a)).toBe(false);
      expect(moved.panes[1].ws.tabs.find((t) => t.id === a)?.pinned).toBe(true);
    });
  });
});
