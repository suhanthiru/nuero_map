import { describe, expect, it } from "vitest";
import { bookmarkKey, isBookmarked, removeBookmark, restoreBookmarks, toggleBookmark } from "./bookmarks";

const topic = (topicId: string) => ({ kind: "topic" as const, topicId });

describe("bookmarks", () => {
  it("toggles newest first and saves a focused graph as the whole map", () => {
    let list = toggleBookmark([], topic("a"));
    list = toggleBookmark(list, { kind: "graph", focusTopicId: "a", edgeId: "e" });

    expect(list).toEqual([{ kind: "graph" }, topic("a")]);
    expect(isBookmarked(list, { kind: "graph", focusTopicId: "z" })).toBe(true);
    expect(toggleBookmark(list, topic("a"))).toEqual([{ kind: "graph" }]);
    expect(removeBookmark(list, { kind: "graph" })).toEqual([topic("a")]);
  });

  it("keys topics by id and screens by kind", () => {
    expect(bookmarkKey(topic("a"))).toBe("topic:a");
    expect(bookmarkKey({ kind: "settings" })).toBe("settings");
  });

  it("restores only well-formed, distinct entries", () => {
    expect(restoreBookmarks([topic("a"), topic("a"), { kind: "bogus" }, { kind: "topic" }, null, { kind: "graph", edgeId: "x" }])).toEqual([
      topic("a"),
      { kind: "graph" },
    ]);
    expect(restoreBookmarks("nope")).toEqual([]);
  });
});
