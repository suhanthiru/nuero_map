import type { EdgeKind, GraphData, GraphEdge, GraphNode, TopicState, TopicSummary } from "../../contract";
import { daysAgo, MOCK_NOW, pick, seededRandom } from "../rng";
import { MOCK_TOPICS } from "./topics";

type EdgeSeed = readonly [string, string, EdgeKind, number, number];

const EDGE_SEEDS: readonly EdgeSeed[] = [
  ["t-neural-map", "t-decay", "explicit", 0.95, 9],
  ["t-neural-map", "t-paper-theme", "explicit", 0.8, 5],
  ["t-neural-map", "t-wispr", "cooccurrence", 0.55, 3],
  ["t-decay", "t-systems-book", "explicit", 0.7, 2],
  ["t-neural-map", "t-rust-async", "cooccurrence", 0.45, 4],
  ["t-robot-arm", "t-rust-async", "semantic", 0.3, 1],
  ["t-internships", "t-neural-map", "cooccurrence", 0.35, 2],
  ["t-study-app", "t-internships", "cooccurrence", 0.4, 3],
  ["t-sleep", "t-internships", "semantic", 0.25, 1],
  ["t-homelab", "t-rust-async", "semantic", 0.28, 1],
  ["t-study-app", "t-decay", "semantic", 0.32, 1],
];

const RECENTLY_LINKED = new Set(["t-decay", "t-systems-book"]);

function edgeFromSeed([source, target, kind, strength, evidenceCount]: EdgeSeed, i: number): GraphEdge {
  return { id: `e-${i}`, source, target, kind, strength, evidenceCount, lastSeenAt: daysAgo(i + 1) };
}

function toNode(topic: TopicSummary): GraphNode {
  return { ...topic, recentlyLinked: RECENTLY_LINKED.has(topic.id) };
}

export const MOCK_EDGES: readonly GraphEdge[] = EDGE_SEEDS.map(edgeFromSeed);

export function mockGraph(): GraphData {
  return { nodes: MOCK_TOPICS.map(toNode), edges: MOCK_EDGES, generatedAt: new Date(MOCK_NOW).toISOString() };
}

const SYNTH_WORDS = [
  "pricing", "servo", "habit", "graph", "latency", "resume", "sleep", "embedding", "garden",
  "budget", "reading", "sketch", "cache", "focus", "routine", "prototype", "notes", "travel",
] as const;
const STATES: readonly TopicState[] = ["active", "active", "active", "parked", "done", "dead"];
const KINDS: readonly EdgeKind[] = ["explicit", "cooccurrence", "cooccurrence", "semantic", "semantic"];
const CLUSTER_SIZE = 25;
const EDGES_PER_NODE = 2.5;

function synthNode(rand: () => number, i: number): GraphNode {
  const last = Math.floor(rand() * 200);
  return {
    id: `s-${i}`,
    title: `${pick(rand, SYNTH_WORDS)} ${pick(rand, SYNTH_WORDS)} ${i}`,
    aliases: [],
    state: pick(rand, STATES),
    decay: Math.pow(0.5, last / 30),
    ideaCount: 1 + Math.floor(rand() * 40),
    summary: "Synthetic topic for layout and legibility testing.",
    createdAt: daysAgo(last + 30),
    lastActiveAt: daysAgo(last),
    checkInAt: null,
    recentlyLinked: rand() < 0.03,
  };
}

function synthEdge(rand: () => number, i: number, count: number): GraphEdge {
  const a = Math.floor(rand() * count);
  const sameCluster = rand() < 0.8;
  const clusterStart = a - (a % CLUSTER_SIZE);
  const b = sameCluster
    ? clusterStart + Math.floor(rand() * Math.min(CLUSTER_SIZE, count - clusterStart))
    : Math.floor(rand() * count);
  return {
    id: `se-${i}`,
    source: `s-${a}`,
    target: `s-${b === a ? (a + 1) % count : b}`,
    kind: pick(rand, KINDS),
    strength: Math.round(rand() * 100) / 100,
    evidenceCount: 1 + Math.floor(rand() * 6),
    lastSeenAt: daysAgo(Math.floor(rand() * 120)),
  };
}

/** Deterministic clustered graph of `count` nodes for stress-testing the renderer. */
export function syntheticGraph(count: number, seed = 7): GraphData {
  const rand = seededRandom(seed);
  const nodes = Array.from({ length: count }, (_, i) => synthNode(rand, i));
  const edgeCount = Math.floor(count * EDGES_PER_NODE);
  const edges = Array.from({ length: edgeCount }, (_, i) => synthEdge(rand, i, count));
  return { nodes, edges, generatedAt: new Date(MOCK_NOW).toISOString() };
}
