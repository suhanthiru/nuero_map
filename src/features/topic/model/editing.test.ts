import { describe, expect, it } from "vitest";
import { changedSpan, indentList, toggleChecklist, toggleWrap, wikilinkQuery } from "./editing";

/** `|` marks the caret in these fixtures. */
function at(text: string): { value: string; caret: number } {
  const caret = text.indexOf("|");
  return { value: text.replace("|", ""), caret };
}

describe("indentList", () => {
  it("indents and outdents list lines, keeping the selection on them", () => {
    const value = "- a\n- b\ntext";
    const indented = indentList(value, 4, 7, false);
    expect(indented?.value).toBe("- a\n\t- b\ntext");
    expect(indented?.start).toBe(5);

    const back = indentList(indented!.value, indented!.start, indented!.end, true);
    expect(back?.value).toBe(value);
  });

  it("leaves Tab alone when no line is a list item, and Shift+Tab when there's nothing to outdent", () => {
    expect(indentList("text", 0, 0, false)).toBeNull();
    expect(indentList("- top", 5, 5, true)).toBeNull();
  });
});

describe("toggleWrap", () => {
  it("wraps and unwraps a selection", () => {
    const wrapped = toggleWrap("a word here", 2, 6, "**");
    expect(wrapped).toEqual({ value: "a **word** here", start: 4, end: 8 });
    expect(toggleWrap(wrapped.value, wrapped.start, wrapped.end, "**")).toEqual({ value: "a word here", start: 2, end: 6 });
  });

  it("puts the caret between the marks when nothing is selected", () => {
    expect(toggleWrap("ab", 1, 1, "*")).toEqual({ value: "a**b", start: 2, end: 2 });
  });
});

describe("wikilink completion", () => {
  it("finds an open [[ on the caret's line", () => {
    const typing = at("see [[dec|");
    expect(wikilinkQuery(typing.value, typing.caret)).toEqual({ from: 4, query: "dec" });
    const closed = at("see [[done]] |");
    expect(wikilinkQuery(closed.value, closed.caret)).toBeNull();
    const otherLine = at("[[open\nnext|");
    expect(wikilinkQuery(otherLine.value, otherLine.caret)).toBeNull();
  });
});

describe("toggleWrap inside bold", () => {
  it("adds italic to bold text instead of unwrapping one star, and removes it again", () => {
    const italic = toggleWrap("**bold**", 2, 6, "*");
    expect(italic.value).toBe("***bold***");
    expect(toggleWrap(italic.value, italic.start, italic.end, "*").value).toBe("**bold**");
  });
});

describe("changedSpan", () => {
  it("finds the smallest replaced span", () => {
    expect(changedSpan("abcdef", "abXYef")).toEqual({ from: 2, to: 4, insert: "XY" });
    expect(changedSpan("abc", "abc")).toEqual({ from: 3, to: 3, insert: "" });
    expect(changedSpan("aaa", "aaaa")).toEqual({ from: 3, to: 3, insert: "a" });
  });
});

describe("toggleChecklist", () => {
  it("turns text into a task, adds a box to list items, and flips tasks", () => {
    expect(toggleChecklist("buy milk")).toBe("- [ ] buy milk");
    expect(toggleChecklist("  - item")).toBe("  - [ ] item");
    expect(toggleChecklist("1. step")).toBe("1. [ ] step");
    expect(toggleChecklist("- [ ] open")).toBe("- [x] open");
    expect(toggleChecklist("> - [X] done")).toBe("> - [ ] done");
  });
});
