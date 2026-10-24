import { describe, expect, it } from "vitest";
import type { Idea, SourceRef } from "../../../api/contract";
import { buildTimeline, numberCitations, weeklyActivity } from "./timeline";

function src(messageId: string): SourceRef {
  return { messageId, conversationId: "c", app: "claude", speaker: "user", timestamp: "2026-01-01T00:00:00Z" };
}

function idea(id: string, occurredAt: string, duplicateOf: string | null = null): Idea {
  return {
    id,
    title: id,
    summary: "",
    kind: "insight",
    excerpt: { text: id, source: src(`m-${id}`) },
    occurredAt,
    isUserOriginated: true,
    duplicateOf,
  };
}

describe("buildTimeline", () => {
  it("groups newest first by month and folds restatements under the original", () => {
    const groups = buildTimeline([
      idea("a", "2026-08-03T00:00:00Z"),
      idea("b", "2026-09-10T00:00:00Z"),
      idea("c", "2026-09-20T00:00:00Z", "a"),
      idea("d", "2026-09-01T00:00:00Z"),
    ]);

    expect(groups.map((g) => g.key)).toEqual(["2026-09", "2026-08"]);
    expect(groups[0].label).toBe("September 2026");
    expect(groups[0].entries.map((e) => e.idea.id)).toEqual(["b", "d"]);
    expect(groups[1].entries[0].restatements.map((r) => r.id)).toEqual(["c"]);
  });

  it("keeps a duplicate whose original isn't on this page", () => {
    const groups = buildTimeline([idea("x", "2026-09-01T00:00:00Z", "elsewhere")]);
    expect(groups[0].entries[0].idea.id).toBe("x");
  });
});

describe("weeklyActivity", () => {
  const now = Date.parse("2026-10-20T00:00:00Z");

  it("counts ideas per week, oldest first, ignoring anything outside the window", () => {
    const buckets = weeklyActivity(
      [idea("a", "2026-10-19T00:00:00Z"), idea("b", "2026-10-18T00:00:00Z"), idea("c", "2026-10-05T00:00:00Z"), idea("old", "2025-01-01T00:00:00Z")],
      4,
      now,
    );

    expect(buckets.map((b) => b.count)).toEqual([0, 1, 0, 2]);
  });
});

describe("numberCitations", () => {
  it("gives each distinct source one number across lines", () => {
    const out = numberCitations([
      { text: "one", sources: [src("m1"), src("m2")] },
      { text: "two", sources: [src("m2"), src("m3")] },
    ]);

    expect(out.lines.map((l) => l.marks.map((m) => m.n))).toEqual([[1, 2], [2, 3]]);
    expect(out.sources.map((s) => s.messageId)).toEqual(["m1", "m2", "m3"]);
  });
});
