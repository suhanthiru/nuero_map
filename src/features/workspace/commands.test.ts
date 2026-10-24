import { describe, expect, it } from "vitest";
import { useNoteModes } from "../topic/noteMode";
import { COMMANDS, commandForKey, isAvailable, recentCommandIds, recordCommandUse, runCommand } from "./commands";
import { focusedView } from "./model/panes";
import { resetWorkspace, useWorkspace } from "./workspaceStore";

const press = (k: string, mods: Partial<{ ctrlKey: boolean; shiftKey: boolean; altKey: boolean }> = {}) => ({
  key: k,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  ...mods,
});

describe("command registry", () => {
  it("has unique ids and no two commands on one hotkey", () => {
    const ids = COMMANDS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    const keys = COMMANDS.flatMap((c) => (c.hotkeys ?? []).map((h) => `${h.mod}-${h.shift}-${h.alt}-${h.key.toLowerCase()}`));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("finds a command by key, leaving Alt+arrows to text fields", () => {
    expect(commandForKey(press("p", { ctrlKey: true }), false)?.id).toBe("palette:open");
    expect(commandForKey(press("Tab", { ctrlKey: true, shiftKey: true }), false)?.id).toBe("tab:prev");
    expect(commandForKey(press("ArrowLeft", { altKey: true }), false)?.id).toBe("nav:back");
    expect(commandForKey(press("ArrowLeft", { altKey: true }), true)).toBeUndefined();
    expect(commandForKey(press("e", { ctrlKey: true }), true)?.id).toBe("note:toggle-mode");
    expect(commandForKey(press("x"), false)).toBeUndefined();
  });

  it("only offers the reading/editing toggle on a topic, per tab", () => {
    resetWorkspace();
    expect(runCommand("note:toggle-mode")).toBe(false);

    resetWorkspace({ kind: "topic", topicId: "t-decay" });
    const tabId = useWorkspace.getState().ws.activeId;
    expect(runCommand("note:toggle-mode")).toBe(true);
    expect(useNoteModes.getState().modes[tabId]).toBe("editing");
  });

  it("splits right and bookmarks through the registry", () => {
    resetWorkspace({ kind: "topic", topicId: "t-decay" });

    runCommand("pane:split-right");
    const { layout } = useWorkspace.getState();
    expect(layout.panes).toHaveLength(2);
    expect(focusedView(layout)).toEqual({ kind: "topic", topicId: "t-decay" });

    const add = COMMANDS.find((c) => c.id === "bookmark:add");
    const remove = COMMANDS.find((c) => c.id === "bookmark:remove");
    expect(add && isAvailable(add)).toBe(true);
    runCommand("bookmark:add");
    expect(useWorkspace.getState().bookmarks).toEqual([{ kind: "topic", topicId: "t-decay" }]);
    expect(add && isAvailable(add)).toBe(false);
    expect(remove && isAvailable(remove)).toBe(true);
  });

  it("remembers what the palette ran, most recent first", () => {
    recordCommandUse("graph:open");
    recordCommandUse("tab:new");
    recordCommandUse("graph:open");
    recordCommandUse("not-a-command");

    expect(recentCommandIds()).toEqual(["graph:open", "tab:new"]);
  });
});
