import { describe, expect, it } from "vitest";
import { fuzzyScore, hotkeyLabel, hotkeyParts, matchesHotkey, rankByName } from "./hotkeys";

const key = (k: string, mods: Partial<{ ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }> = {}) => ({
  key: k,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  ...mods,
});

describe("hotkeys", () => {
  it("matches modifiers exactly, Ctrl or Cmd, ignoring letter case", () => {
    expect(matchesHotkey(key("p", { ctrlKey: true }), { key: "p", mod: true })).toBe(true);
    expect(matchesHotkey(key("p", { metaKey: true }), { key: "p", mod: true })).toBe(true);
    expect(matchesHotkey(key("F", { ctrlKey: true, shiftKey: true }), { key: "f", mod: true, shift: true })).toBe(true);
    expect(matchesHotkey(key("Tab", { ctrlKey: true, shiftKey: true }), { key: "Tab", mod: true })).toBe(false);
    expect(matchesHotkey(key("p"), { key: "p", mod: true })).toBe(false);
  });

  it("formats chips and labels", () => {
    expect(hotkeyParts({ key: "f", mod: true, shift: true })).toEqual(["Ctrl", "Shift", "F"]);
    expect(hotkeyLabel({ key: "ArrowLeft", alt: true })).toBe("Alt+←");
  });

  it("fuzzy-matches in order and prefers word starts and runs", () => {
    expect(fuzzyScore("spr", "Split right")).not.toBeNull();
    expect(fuzzyScore("rps", "Split right")).toBeNull();
    expect(fuzzyScore("", "anything")).toBe(0);
    expect(fuzzyScore("graph", "Open graph view") as number).toBeGreaterThan(fuzzyScore("graph", "Go to right pane, a ph") ?? -Infinity);
  });

  it("ranks recent commands first with no query, best match first with one", () => {
    const items = [
      { id: "a", name: "Open settings" },
      { id: "b", name: "Split right" },
      { id: "c", name: "Close current tab" },
    ];

    expect(rankByName(items, "", ["c"]).map((i) => i.id)).toEqual(["c", "a", "b"]);
    expect(rankByName(items, "split", []).map((i) => i.id)).toEqual(["b"]);
    expect(rankByName(items, "zzz", [])).toEqual([]);
  });
});
