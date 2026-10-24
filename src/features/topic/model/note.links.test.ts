import { describe, expect, it } from "vitest";
import type { TopicSummary } from "../../../api/contract";
import { proseLines, resolveLinkTarget, wikilinkRefs, wikilinkTargets } from "./note";

function topic(id: string, title: string, aliases: string[] = []): TopicSummary {
  return { id, title, aliases, state: "active", decay: 0.5, ideaCount: 1, summary: "", createdAt: "", lastActiveAt: "", checkInAt: null };
}

describe("wikilinkRefs", () => {
  it("lists links with their line, skipping code spans and fences", () => {
    const body = "See [[Decay]] and [[Systems|stocks]]\n`[[not]]`\n```\n[[fenced]]\n```\n![[Embed]] last";

    expect(wikilinkRefs(body)).toEqual([
      { target: "Decay", line: 1, text: "See [[Decay]] and [[Systems|stocks]]" },
      { target: "Systems", line: 1, text: "See [[Decay]] and [[Systems|stocks]]" },
      { target: "Embed", line: 6, text: "![[Embed]] last" },
    ]);
  });
});

describe("wikilinkTargets", () => {
  it("is the same set however the links are written or ordered", () => {
    const a = wikilinkTargets("[[Decay  scoring]] then [[robot arm|arm]]");
    const b = wikilinkTargets("[[Robot Arm]]\n[[decay scoring]] and again [[Decay scoring]]");

    expect(a).toEqual(["decay scoring", "robot arm"]);
    expect(b).toEqual(a);
    expect(wikilinkTargets("no links, `[[code]]`")).toEqual([]);
  });
});

describe("resolveLinkTarget", () => {
  const topics = [topic("c", "C#"), topic("r", "Rust", ["ferris"])];

  it("tries the whole target, then the part before #", () => {
    expect(resolveLinkTarget("C#", topics)?.id).toBe("c");
    expect(resolveLinkTarget("Rust#Ownership", topics)?.id).toBe("r");
    expect(resolveLinkTarget("ferris", topics)?.id).toBe("r");
    expect(resolveLinkTarget("Go", topics)).toBeUndefined();
  });
});

describe("proseLines", () => {
  it("leaves out fenced code with its fences", () => {
    expect(proseLines("one\n```\ncode\n```\ntwo")).toEqual([
      { line: 1, text: "one" },
      { line: 5, text: "two" },
    ]);
  });
});
