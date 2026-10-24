import { describe, expect, it } from "vitest";
import {
  activeTab,
  closeTab,
  currentView,
  cycle,
  goBack,
  goForward,
  initialWorkspace,
  moveTab,
  openView,
  pruneTopics,
  restore,
  setPinned,
  type Workspace,
} from "./tabs";

function ids() {
  let n = 0;
  return () => `t${++n}`;
}

const topic = (topicId: string) => ({ kind: "topic" as const, topicId });

describe("tabs", () => {
  it("starts with one Today tab", () => {
    const ws = initialWorkspace(ids());
    expect(ws.tabs).toHaveLength(1);
    expect(currentView(activeTab(ws))).toEqual({ kind: "today" });
  });

  it("navigates the active tab and keeps per-tab back/forward history", () => {
    const newId = ids();
    let ws = initialWorkspace(newId);
    ws = openView(ws, topic("a"), newId);
    ws = openView(ws, topic("b"), newId);
    const tabId = ws.activeId;

    ws = goBack(ws, tabId);
    expect(currentView(activeTab(ws))).toEqual(topic("a"));
    ws = goForward(ws, tabId);
    expect(currentView(activeTab(ws))).toEqual(topic("b"));
    ws = openView(goBack(ws, tabId), topic("c"), newId);
    expect(activeTab(ws).history.map((v) => (v.kind === "topic" ? v.topicId : v.kind))).toEqual(["today", "a", "c"]);
    expect(goForward(ws, tabId)).toBe(ws);
  });

  it("opens new tabs next to the active one, optionally in the background", () => {
    const newId = ids();
    let ws = initialWorkspace(newId);
    ws = openView(ws, topic("a"), newId, { newTab: true });
    const a = ws.activeId;
    ws = openView(ws, topic("b"), newId, { newTab: true, background: true });

    expect(ws.activeId).toBe(a);
    expect(ws.tabs.map((t) => currentView(t))).toEqual([{ kind: "today" }, topic("a"), topic("b")]);
  });

  it("focuses an existing tab for single-instance screens", () => {
    const newId = ids();
    let ws = initialWorkspace(newId);
    ws = openView(ws, { kind: "settings" }, newId, { newTab: true });
    ws = openView(ws, topic("a"), newId, { newTab: true });

    ws = openView(ws, { kind: "settings" }, newId);

    expect(currentView(activeTab(ws))).toEqual({ kind: "settings" });
    expect(ws.tabs).toHaveLength(3);
  });

  it("closes tabs, focusing a neighbour, and never leaves zero tabs", () => {
    const newId = ids();
    let ws = initialWorkspace(newId);
    ws = openView(ws, topic("a"), newId, { newTab: true });
    ws = openView(ws, topic("b"), newId, { newTab: true });
    const [first, second, third] = ws.tabs.map((t) => t.id);

    ws = closeTab(ws, third, newId);
    expect(ws.activeId).toBe(second);
    ws = closeTab(closeTab(ws, second, newId), first, newId);
    expect(ws.tabs).toHaveLength(1);
    expect(currentView(ws.tabs[0])).toEqual({ kind: "today" });
  });

  it("cycles and reorders tabs", () => {
    const newId = ids();
    let ws: Workspace = initialWorkspace(newId);
    ws = openView(ws, topic("a"), newId, { newTab: true });
    const [first, second] = ws.tabs.map((t) => t.id);

    expect(cycle(ws, 1).activeId).toBe(first);
    expect(cycle(ws, -1).activeId).toBe(first);
    expect(moveTab(ws, second, 0).tabs.map((t) => t.id)).toEqual([second, first]);
  });

  it("drops tabs for topics that no longer exist", () => {
    const newId = ids();
    let ws = initialWorkspace(newId);
    ws = openView(ws, topic("gone"), newId, { newTab: true });

    ws = pruneTopics(ws, (id) => id !== "gone", newId);

    expect(ws.tabs.map((t) => currentView(t).kind)).toEqual(["today"]);
  });

  it("restores a saved workspace and rejects garbage", () => {
    const newId = ids();
    const saved = openView(initialWorkspace(newId), topic("a"), newId, { newTab: true });

    expect(restore(JSON.parse(JSON.stringify(saved)), newId)).toEqual(saved);
    expect(restore({ tabs: [{ id: 1 }], activeId: "x" }, newId).tabs).toHaveLength(1);
    expect(restore(null, newId).tabs).toHaveLength(1);
    expect(restore({ tabs: [{ id: "q", history: [{ kind: "bogus" }], index: 0 }], activeId: "q" }, newId).tabs[0].id).not.toBe("q");
  });

  describe("pinned tabs", () => {
    function pinnedOn(view = topic("a")) {
      const newId = ids();
      let ws = openView(initialWorkspace(newId), view, newId);
      ws = setPinned(ws, ws.activeId, true);
      return { ws, newId };
    }

    it("opens anything new beside a pinned tab instead of replacing it", () => {
      const { ws, newId } = pinnedOn();
      const pinnedId = ws.activeId;

      const next = openView(ws, topic("b"), newId);

      expect(next.tabs).toHaveLength(2);
      expect(currentView(next.tabs[0])).toEqual(topic("a"));
      expect(next.activeId).not.toBe(pinnedId);
      expect(currentView(activeTab(next))).toEqual(topic("b"));
    });

    it("opening the view a pinned tab already shows keeps it, without a duplicate tab", () => {
      const { ws, newId } = pinnedOn();

      expect(openView(ws, topic("a"), newId)).toBe(ws);
    });

    it("still goes back and forward within its own history", () => {
      const { ws } = pinnedOn();
      const back = goBack(ws, ws.activeId);

      expect(currentView(activeTab(back))).toEqual({ kind: "today" });
      expect(currentView(activeTab(goForward(back, back.activeId)))).toEqual(topic("a"));
    });

    it("doesn't close until unpinned", () => {
      const { ws, newId } = pinnedOn();

      expect(closeTab(ws, ws.activeId, newId)).toBe(ws);
      const unpinned = setPinned(ws, ws.activeId, false);
      expect(unpinned.tabs[0].pinned).toBeUndefined();
      expect(closeTab(unpinned, unpinned.activeId, newId).tabs[0].id).not.toBe(ws.activeId);
    });

    it("keeps pinned through a save and drops anything that isn't exactly true", () => {
      const { ws, newId } = pinnedOn();

      expect(restore(JSON.parse(JSON.stringify(ws)), newId).tabs[0].pinned).toBe(true);
      const odd = { tabs: [{ id: "q", history: [{ kind: "today" }], index: 0, pinned: "yes" }], activeId: "q" };
      expect(restore(odd, newId).tabs[0]).toEqual({ id: "q", history: [{ kind: "today" }], index: 0 });
    });
  });
});
