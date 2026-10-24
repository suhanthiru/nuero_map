import type {
  Connection,
  EdgeEvidence,
  Excerpt,
  Gem,
  Idea,
  SynthesisVersion,
  TopicPage,
  TopicSummary,
} from "../../contract";
import { daysAgo } from "../rng";
import { MOCK_EDGES } from "./graph";
import { messageText, sourceRef } from "./sources";
import { findTopic, MOCK_TOPICS } from "./topics";

function excerpt(messageId: string): Excerpt {
  return { text: messageText(messageId), source: sourceRef(messageId) };
}

const IDEAS: readonly Idea[] = [
  { id: "i1", title: "Turn my chats into a neural graph", summary: "New topics become nodes; connections become weighted edges.", kind: "insight", excerpt: excerpt("m1"), occurredAt: daysAgo(21), isUserOriginated: true, duplicateOf: null },
  { id: "i2", title: "Retrieval is the product", summary: "Edge click shows the excerpts where two ideas touched.", kind: "insight", excerpt: excerpt("m2"), occurredAt: daysAgo(21), isUserOriginated: false, duplicateOf: null },
  { id: "i3", title: "Topic states you control", summary: "active / parked / done / dead with check-ins for parked topics.", kind: "decision", excerpt: excerpt("m4"), occurredAt: daysAgo(20), isUserOriginated: false, duplicateOf: null },
  { id: "i4", title: "Keep topics from being forgotten", summary: "Asked how to keep ideas alive and re-readable.", kind: "question", excerpt: excerpt("m3"), occurredAt: daysAgo(20), isUserOriginated: true, duplicateOf: null },
  { id: "i5", title: "Paper and rust visual design", summary: "Zed-inspired warm paper theme.", kind: "preference", excerpt: excerpt("m5"), occurredAt: daysAgo(18), isUserOriginated: true, duplicateOf: null },
  { id: "i6", title: "Separate my words from the AI's", summary: "Ink for user text, lighter rust for AI text.", kind: "decision", excerpt: excerpt("m6"), occurredAt: daysAgo(18), isUserOriginated: false, duplicateOf: null },
  { id: "i7", title: "Decay keys off message time", summary: "Never ingest time, or weekly exports look hot.", kind: "decision", excerpt: excerpt("m8"), occurredAt: daysAgo(19), isUserOriginated: false, duplicateOf: null },
  { id: "i8", title: "Decay is a stock with an outflow", summary: "Mentions flow in, time drains at a constant fraction.", kind: "insight", excerpt: excerpt("m9"), occurredAt: daysAgo(9), isUserOriginated: true, duplicateOf: null },
  { id: "i9", title: "Neural graph from chats (restated)", summary: "Same idea as the original graph pitch.", kind: "insight", excerpt: excerpt("m1"), occurredAt: daysAgo(17), isUserOriginated: true, duplicateOf: "i1" },
  { id: "i10", title: "Fix servo jitter at the source", summary: "Power sag from the elbow servo, not the signal.", kind: "problem", excerpt: excerpt("m12"), occurredAt: daysAgo(4), isUserOriginated: false, duplicateOf: null },
  { id: "i11", title: "Run the control loop off the arm", summary: "Maybe on the spare laptop.", kind: "question", excerpt: excerpt("m19"), occurredAt: daysAgo(3), isUserOriginated: true, duplicateOf: null },
];

const TOPIC_IDEAS: Readonly<Record<string, readonly string[]>> = {
  "t-neural-map": ["i1", "i2", "i4", "i3", "i6", "i9"],
  "t-decay": ["i7", "i8", "i3"],
  "t-paper-theme": ["i5", "i6"],
  "t-systems-book": ["i8"],
  "t-robot-arm": ["i10", "i11"],
};

export function ideasFor(topicId: string): Idea[] {
  const ids = TOPIC_IDEAS[topicId] ?? ["i1"];
  return ids.map((id) => IDEAS.find((i) => i.id === id)).filter((i): i is Idea => i !== undefined);
}

function synthesisFor(topic: TopicSummary): SynthesisVersion {
  return {
    id: `syn-${topic.id}-3`,
    version: 3,
    model: "claude-opus-5-5",
    createdAt: daysAgo(1),
    lines: [
      { text: `${topic.title}: ${topic.summary}`, sources: [sourceRef("m1")] },
      { text: "The valuable part is retrieval: every edge opens the exact excerpts where two ideas met.", sources: [sourceRef("m2")] },
      { text: "Topics carry a state you control, and parked ones come back on a check-in date.", sources: [sourceRef("m4"), sourceRef("m3")] },
      { text: "Open question: how aggressively to hide weak similarity links by default.", sources: [sourceRef("m8")] },
    ],
  };
}

const GEMS: readonly Gem[] = [
  { id: "g1", topicId: "t-neural-map", ideaId: "i2", excerpt: excerpt("m2"), pinnedAt: daysAgo(20) },
  { id: "g2", topicId: "t-neural-map", ideaId: "i6", excerpt: excerpt("m6"), pinnedAt: daysAgo(17) },
  { id: "g3", topicId: "t-decay", ideaId: "i7", excerpt: excerpt("m8"), pinnedAt: daysAgo(18) },
];

function connectionsFor(topicId: string): Connection[] {
  return MOCK_EDGES.filter((e) => e.source === topicId || e.target === topicId).flatMap((edge) => {
    const other = findTopic(edge.source === topicId ? edge.target : edge.source);
    return other ? [{ edge, topic: other, evidence: [excerpt(edge.kind === "explicit" ? "m10" : "m2")] }] : [];
  });
}

export function mockTopicPage(topicId: string): TopicPage {
  const topic = findTopic(topicId);
  if (!topic) throw { code: "not_found", message: `topic ${topicId}` };
  const current = topic.state === "dead" ? null : synthesisFor(topic);
  const previous: SynthesisVersion | null = current
    ? { ...current, id: `syn-${topic.id}-2`, version: 2, createdAt: daysAgo(8), lines: current.lines.slice(0, 2) }
    : null;
  return {
    topic,
    current,
    history: [current, previous].filter((v): v is SynthesisVersion => v !== null),
    gems: GEMS.filter((g) => g.topicId === topicId),
    ideas: ideasFor(topicId),
    connections: connectionsFor(topicId),
  };
}

export function mockEdgeEvidence(edgeId: string): EdgeEvidence {
  const edge = MOCK_EDGES.find((e) => e.id === edgeId);
  const a = edge && findTopic(edge.source);
  const b = edge && findTopic(edge.target);
  if (!edge || !a || !b) throw { code: "not_found", message: `edge ${edgeId}` };
  return { edge, topics: [a, b], excerpts: [excerpt("m9"), excerpt("m10"), excerpt("m8")] };
}

export { MOCK_TOPICS };
