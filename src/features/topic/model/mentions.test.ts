import { describe, expect, it } from "vitest";
import type { TopicSummary, UnlinkedMention } from "../../../api/contract";
import { appendLinkLine, groupMentions, linkFor, linkMentionInNote, snippetAround } from "./mentions";

function topic(id: string): TopicSummary {
  return { id, title: id, aliases: [], state: "active", decay: 0.5, ideaCount: 1, summary: "", createdAt: "", lastActiveAt: "", checkInAt: null };
}

function noteMention(text: string, word: string, line = 1, from = "s"): UnlinkedMention {
  const start = text.indexOf(word);
  return { topic: topic(from), source: "note", text, start, end: start + word.length, line, excerpt: null };
}

describe("snippetAround", () => {
  it("keeps short text whole", () => {
    expect(snippetAround("a decay b", 2, 7)).toEqual({ before: "a ", match: "decay", after: " b" });
  });

  it("trims long text at word breaks with ellipses", () => {
    const text = `${"lorem ipsum ".repeat(20)}decay${" dolor sit".repeat(20)}`;
    const start = text.indexOf("decay");
    const snip = snippetAround(text, start, start + 5, 20);

    expect(snip.match).toBe("decay");
    expect(snip.before.startsWith("…")).toBe(true);
    expect(snip.after.endsWith("…")).toBe(true);
    expect(snip.before.length).toBeLessThanOrEqual(21);
  });
});

describe("linking a mention", () => {
  it("keeps the words as written when they differ from the title", () => {
    expect(linkFor("Decay scoring", "Decay scoring")).toBe("[[Decay scoring]]");
    expect(linkFor("Learning async Rust", "tokio")).toBe("[[Learning async Rust|tokio]]");
  });

  it("rewrites the mention on its line", () => {
    const body = "intro\nStocks map onto decay scoring here.\nend";
    const m = noteMention("Stocks map onto decay scoring here.", "decay scoring", 2);

    expect(linkMentionInNote(body, m, "Decay scoring")).toBe("intro\nStocks map onto [[Decay scoring|decay scoring]] here.\nend");
  });

  it("refuses when the line changed since the mention was found", () => {
    const m = noteMention("Stocks map onto decay scoring here.", "decay scoring", 2);

    expect(linkMentionInNote("intro\nStocks now map onto decay scoring.\nend", m, "Decay scoring")).toBeNull();
    expect(linkMentionInNote("intro", m, "Decay scoring")).toBeNull();
  });

  it("appends a link line to a note, empty or not", () => {
    expect(appendLinkLine("", "Robot arm")).toBe("- [[Robot arm]]\n");
    expect(appendLinkLine("Notes here\n\n", "Robot arm")).toBe("Notes here\n- [[Robot arm]]\n");
  });
});

describe("groupMentions", () => {
  it("groups by mentioning topic, keeping the order they came in", () => {
    const a1 = noteMention("x decay", "decay", 1, "a");
    const b1 = noteMention("decay y", "decay", 1, "b");
    const a2 = noteMention("decay z", "decay", 3, "a");

    expect(groupMentions([a1, b1, a2]).map((g) => [g.topicId, g.mentions.length])).toEqual([
      ["a", 2],
      ["b", 1],
    ]);
  });
});
