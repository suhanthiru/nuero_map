import { describe, expect, it } from "vitest";
import type { GraphEdge, TopicNote, TopicSummary } from "../../contract";
import { findNameMatches, unlinkedMentions } from "./mentions";
import { noteLinksBetween, resolveNoteLinks, withNoteEdges } from "./noteLinks";

function topic(id: string, title: string, aliases: string[] = []): TopicSummary {
  return { id, title, aliases, state: "active", decay: 0.5, ideaCount: 1, summary: "", createdAt: "", lastActiveAt: "", checkInAt: null };
}

function notes(...list: [string, string][]): ReadonlyMap<string, TopicNote> {
  return new Map(list.map(([topicId, body]) => [topicId, { topicId, body, updatedAt: "2026-10-01T00:00:00Z" }]));
}

const TOPICS = [topic("a", "Decay scoring", ["half-life"]), topic("b", "Robot arm"), topic("c", "Rust")];

describe("note links in the mock", () => {
  it("resolves links by title or alias and drops self links and unknown targets", () => {
    const links = resolveNoteLinks(notes(["a", "[[Robot arm]] and [[Decay scoring]] and [[Nope]]"], ["b", "x\n[[half-life]]"]), TOPICS);

    expect(links.map((l) => [l.topicId, l.targetId, l.line])).toEqual([
      ["a", "b", 1],
      ["b", "a", 2],
    ]);
    expect(noteLinksBetween(links, "b", "a").map((l) => l.topicId)).toEqual(["a", "b"]);
  });

  it("flags chat edges a note also links and adds note-only edges", () => {
    const chat: GraphEdge = { id: "e-1", source: "a", target: "b", kind: "cooccurrence", strength: 0.4, evidenceCount: 2, lastSeenAt: "" };
    const n = notes(["a", "[[Robot arm]] [[Rust]]"]);
    const edges = withNoteEdges([chat], resolveNoteLinks(n, TOPICS), n);

    expect(edges[0]).toMatchObject({ id: "e-1", kind: "cooccurrence", linkedInNote: true });
    expect(edges[1]).toMatchObject({ source: "a", target: "c", kind: "note", linkedInNote: true, evidenceCount: 1 });
    expect(edges).toHaveLength(2);
  });

  it("lets a note link replace a weak similar edge, so the default map still shows it", () => {
    const similar: GraphEdge = { id: "e-2", source: "a", target: "c", kind: "semantic", strength: 0.2, evidenceCount: 1, lastSeenAt: "" };
    const n = notes(["a", "[[Rust]]"]);
    const edges = withNoteEdges([similar], resolveNoteLinks(n, TOPICS), n);

    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({ source: "a", target: "c", kind: "note", linkedInNote: true });
  });
});

describe("findNameMatches", () => {
  it("matches whole words, ignoring case, longest name first", () => {
    expect(findNameMatches("Decay Scoring and decay scoring-ish, undecay", ["decay scoring", "decay"])).toEqual([
      { start: 0, end: 13 },
      { start: 18, end: 31 },
    ]);
    expect(findNameMatches("half-life!", ["half-life"])).toEqual([{ start: 0, end: 9 }]);
    expect(findNameMatches("C++ and C#", ["C#"])).toEqual([{ start: 8, end: 10 }]);
  });

  it("counts UTF-16 offsets and skips excluded spans", () => {
    expect(findNameMatches("🙂 rust", ["Rust"])).toEqual([{ start: 3, end: 7 }]);
    expect(findNameMatches("[[Rust]] and Rust", ["rust"], [{ start: 0, end: 8 }])).toEqual([{ start: 13, end: 17 }]);
  });
});

describe("unlinkedMentions", () => {
  it("finds note mentions outside links and code, then ideas from unconnected topics", () => {
    const n = notes(["b", "Uses decay scoring daily\n`decay scoring` and [[Decay scoring]]\n```\ndecay scoring\n```"], ["a", "decay scoring in my own note"]);
    const idea = { id: "i", title: "", summary: "", kind: "fact" as const, occurredAt: "", isUserOriginated: true, duplicateOf: null, excerpt: { text: "the half-life idea", source: { messageId: "m", conversationId: "c", app: "claude" as const, speaker: "user" as const, timestamp: "" } } };
    const found = unlinkedMentions({ topicId: "a", topics: TOPICS, notes: n, connected: new Set(["b"]), ideasOf: () => [idea] });

    expect(found.map((m) => [m.topic.id, m.source, m.line, m.text.slice(m.start, m.end)])).toEqual([
      ["b", "note", 1, "decay scoring"],
      ["c", "idea", null, "half-life"],
    ]);
  });
});
