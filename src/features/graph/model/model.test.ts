import { describe, expect, it } from "vitest";
import type { GraphData, GraphEdge, GraphNode } from "../../../api/contract";
import { filterGraph, localGraph, neighbourhood, neighbours, searchNodes } from "./filterGraph";
import { boundsOf, edgeDistance, fitTransform, toScreen, toWorld } from "./geometry";
import { matchesQuery, paintFor } from "./groups";
import { buildHitIndex, hitTest } from "./hitTest";
import { cycleFocus, moveFocus } from "./keyboardNav";
import { extraLabelAlpha, labelBudget, labelFadeZoom, selectLabels } from "./labelSelection";
import { bucketWidth, drawnRadius, edgeAlphaForZoom, edgeBucket, MIN_NODE_PX, minEdgeStrength, nodeAlpha, R_MAX, R_MIN, radiusScale, sizeValue, valueRadius } from "./scales";
import { byCreation, revealedCount, timeAt, timeSpan } from "./timelapse";
import { DEFAULT_VIEW, type PlacedNode } from "./types";

const NOW = Date.parse("2026-10-20T12:00:00Z");

function node(id: string, over: Partial<GraphNode> = {}): GraphNode {
  return {
    id,
    title: `Topic ${id}`,
    aliases: [],
    state: "active",
    decay: 0.5,
    ideaCount: 4,
    summary: "",
    createdAt: "2026-01-01T00:00:00Z",
    lastActiveAt: "2026-10-19T00:00:00Z",
    checkInAt: null,
    recentlyLinked: false,
    ...over,
  };
}

function edge(id: string, source: string, target: string, over: Partial<GraphEdge> = {}): GraphEdge {
  return { id, source, target, kind: "cooccurrence", strength: 0.5, evidenceCount: 1, lastSeenAt: "2026-10-01T00:00:00Z", ...over };
}

function placed(n: GraphNode, x: number, y: number, r = 6): PlacedNode {
  return { node: n, x, y, r };
}

describe("filterGraph", () => {
  const data: GraphData = {
    nodes: [
      node("a"),
      node("b", { state: "parked" }),
      node("dead", { state: "dead" }),
      node("old", { lastActiveAt: "2025-01-01T00:00:00Z" }),
    ],
    edges: [edge("ab", "a", "b"), edge("a-dead", "a", "dead"), edge("weak", "a", "old", { kind: "semantic" })],
    generatedAt: "",
  };

  it("hides dead topics and weak links by default and drops dangling edges", () => {
    const g = filterGraph(data, DEFAULT_VIEW, NOW);

    expect(g.nodes.map((n) => n.id)).toEqual(["a", "b", "old"]);
    expect(g.edges.map((e) => e.id)).toEqual(["ab"]);
  });

  it("applies the time range and the weak-link toggle", () => {
    const g = filterGraph(data, { ...DEFAULT_VIEW, range: "90d", showWeak: true }, NOW);

    expect(g.nodes.map((n) => n.id)).toEqual(["a", "b"]);
    expect(g.edges.map((e) => e.id)).toEqual(["ab"]);
    expect(filterGraph(data, { ...DEFAULT_VIEW, showWeak: true }, NOW).edges.map((e) => e.id)).toContain("weak");
  });

  it("never mutates its input", () => {
    const before = JSON.stringify(data);
    filterGraph(data, DEFAULT_VIEW, NOW);
    expect(JSON.stringify(data)).toBe(before);
  });

  it("builds symmetric adjacency", () => {
    const adj = neighbours(filterGraph(data, DEFAULT_VIEW, NOW));
    expect([...(adj.get("a") ?? [])]).toEqual(["b"]);
    expect([...(adj.get("b") ?? [])]).toEqual(["a"]);
  });

  it("searches titles and aliases, prefix matches first", () => {
    const nodes = [node("1", { title: "Robot arm", decay: 0.2 }), node("2", { title: "Arm day", decay: 0.1 }), node("3", { title: "x", aliases: ["armature"] })];

    // "Arm day" and the alias "armature" both prefix-match; the livelier topic wins the tie.
    expect(searchNodes(nodes, "arm").map((n) => n.id)).toEqual(["3", "2", "1"]);
    expect(searchNodes(nodes, "  ")).toEqual([]);
  });
});

describe("scales", () => {
  it("sizes by area between R_MIN and R_MAX", () => {
    const nodes = [node("a", { decay: 1, ideaCount: 100 }), node("b", { decay: 0, ideaCount: 3 }), node("c", { decay: 1, ideaCount: 25 })];
    const r = radiusScale(nodes);

    expect(r(nodes[0])).toBe(R_MAX);
    expect(r(nodes[1])).toBe(R_MIN);
    expect(r(nodes[2])).toBeGreaterThan(R_MIN);
    expect(r(nodes[2])).toBeLessThan(R_MAX);
    expect(radiusScale([])(nodes[0])).toBe(R_MIN);
  });

  it("shows fewer, quieter links when zoomed out", () => {
    expect(minEdgeStrength(0.3)).toBeGreaterThan(minEdgeStrength(1));
    expect(minEdgeStrength(2)).toBe(0);
    expect(edgeAlphaForZoom(0.1)).toBe(0.45);
    expect(edgeAlphaForZoom(3)).toBe(1);
  });

  it("fades with decay and quantizes edge widths", () => {
    expect(nodeAlpha(1)).toBe(1);
    expect(nodeAlpha(0)).toBeCloseTo(0.4);
    expect(nodeAlpha(5)).toBe(1);
    expect([0, 0.3, 0.99, 1].map(edgeBucket)).toEqual([0, 1, 3, 3]);
    expect(bucketWidth(3)).toBeGreaterThan(bucketWidth(0));
  });
});

describe("semantic zoom", () => {
  const onScreen = (r: number, k: number) => drawnRadius(r, k) * k;

  it("grows topics only with the square root of zoom when zooming in", () => {
    expect(onScreen(10, 1)).toBe(10);
    expect(onScreen(10, 4)).toBeCloseTo(20);
    expect(onScreen(10, 16)).toBeCloseTo(40);
  });

  it("shrinks topics with the map when zooming out, but never below the minimum", () => {
    expect(onScreen(10, 0.5)).toBeCloseTo(5);
    expect(onScreen(4, 0.1)).toBeCloseTo(MIN_NODE_PX);
  });

  it("hit-tests the drawn size, not the layout size", () => {
    const n = placed(node("a"), 0, 0, 10);
    const idx = buildHitIndex([n], []);
    // At k=4 the topic is drawn with radius 5 (world): x=8 is inside the layout circle only.
    expect(hitTest(idx, { x: 8, y: 0 }, 4).kind).toBe("none");
    expect(hitTest(idx, { x: 5.5, y: 0 }, 4)).toEqual({ kind: "node", id: "a" });
  });

  it("reaches the minimum-size dot of a tiny topic when zoomed far out", () => {
    const tiny = placed(node("tiny"), 0, 0, R_MIN);
    const idx = buildHitIndex([tiny], []);
    // At k=0.1 the dot is MIN_NODE_PX on screen = 20 world units, and the slack is 60.
    // x=75 is within slack of the drawn dot (gap 55) but not of the layout radius (gap 71).
    expect(hitTest(idx, { x: 75, y: 0 }, 0.1)).toEqual({ kind: "node", id: "tiny" });
  });

  it("hangs labels under the drawn topic", () => {
    const n = placed(node("a"), 0, 0, 10);
    const [label] = selectLabels([n], { k: 4, x: 0, y: 0 }, { width: 1000, height: 1000 }, new Set(["a"]), (s) => s.length * 6, 14);
    // Drawn radius on screen is 20, plus the 6px gap.
    expect(label?.y).toBeCloseTo(26);
  });
});

describe("geometry", () => {
  it("round-trips screen and world coordinates", () => {
    const t = { k: 2, x: 10, y: -5 };
    expect(toWorld(toScreen({ x: 3, y: 4 }, t), t)).toEqual({ x: 3, y: 4 });
  });

  it("measures distance to the straight link, clamped to its ends", () => {
    const a = { x: 0, y: 0 };
    const b = { x: 100, y: 0 };

    expect(edgeDistance({ x: 50, y: 0 }, a, b)).toBe(0);
    expect(edgeDistance({ x: 50, y: 40 }, a, b)).toBe(40);
    expect(edgeDistance({ x: -30, y: 40 }, a, b)).toBe(50);
  });

  it("fits bounds into the viewport", () => {
    const b = boundsOf([{ x: 0, y: 0, r: 10 }, { x: 100, y: 50, r: 10 }]);
    const t = fitTransform(b, 400, 300, 0);

    expect(toScreen({ x: 50, y: 25 }, t)).toEqual({ x: 200, y: 150 });
    expect(fitTransform(null, 400, 300)).toEqual({ k: 1, x: 200, y: 150 });
  });
});

describe("hitTest", () => {
  const a = placed(node("a"), 0, 0, 10);
  const b = placed(node("b"), 200, 0, 10);
  const index = buildHitIndex([a, b], [edge("ab", "a", "b")]);

  it("prefers nodes, then edges, then nothing", () => {
    expect(hitTest(index, { x: 12, y: 0 }, 1)).toEqual({ kind: "node", id: "a" });
    expect(hitTest(index, { x: 100, y: 2 }, 1)).toEqual({ kind: "edge", id: "ab" });
    expect(hitTest(index, { x: 100, y: 80 }, 1)).toEqual({ kind: "none" });
  });

  it("keeps the on-screen slack constant across zoom levels", () => {
    expect(hitTest(index, { x: 15, y: 0 }, 1)).toEqual({ kind: "node", id: "a" });
    expect(hitTest(index, { x: 15, y: 0 }, 4).kind).not.toBe("node");
  });

  it("hits the rim of a big node even when a small neighbour's centre is nearer", () => {
    const big = placed(node("big"), 0, 0, 40);
    const small = placed(node("small"), 60, 0, 4);
    const idx = buildHitIndex([big, small], []);
    // x=38 is inside big (gap -2) and nearer small's centre (22) than big's (38).
    expect(hitTest(idx, { x: 38, y: 0 }, 1)).toEqual({ kind: "node", id: "big" });
    expect(hitTest(idx, { x: 58, y: 0 }, 1)).toEqual({ kind: "node", id: "small" });
  });

  it("reaches nodes scaled beyond the default maximum radius", () => {
    const huge = placed(node("huge"), 0, 0, R_MAX * 2);
    const big = buildHitIndex([huge], []);
    expect(hitTest(big, { x: R_MAX * 1.9, y: 0 }, 1)).toEqual({ kind: "node", id: "huge" });
  });
});

describe("labelSelection", () => {
  const measure = (s: string) => s.length * 6;
  const t = { k: 1, x: 0, y: 0 };
  const vp = { width: 1000, height: 1000 };

  it("grows the label budget with zoom", () => {
    expect(labelBudget(1, 500)).toBe(40);
    expect(labelBudget(4, 500)).toBe(320);
    expect(labelBudget(0.2, 500)).toBe(20);
    expect(labelBudget(4, 10)).toBe(10);
  });

  it("drops colliding labels but always keeps pinned ones", () => {
    const big = placed(node("big", { decay: 1, ideaCount: 50 }), 100, 100);
    const small = placed(node("small", { decay: 0.1 }), 102, 101);
    const far = placed(node("far"), 600, 600);

    const ids = (pinned: Set<string>) => selectLabels([small, big, far], t, vp, pinned, measure, 14).map((l) => l.id);

    expect(ids(new Set())).toEqual(["big", "far"]);
    // A pinned label claims its space first, so the colliding one gives way.
    expect(ids(new Set(["small"]))).toEqual(["small", "far"]);
  });

  it("skips off-screen nodes", () => {
    const off = placed(node("off"), -500, -500);
    expect(selectLabels([off], t, vp, new Set(), measure, 14)).toEqual([]);
  });

  it("maps the text fade setting to a zoom and fades labels in toward it", () => {
    expect(labelFadeZoom(0)).toBeCloseTo(0.4);
    expect(labelFadeZoom(1)).toBeCloseTo(2.4);
    expect(extraLabelAlpha(0.5, 2)).toBe(0);
    expect(extraLabelAlpha(1.7, 2)).toBeCloseTo(0.5);
    expect(extraLabelAlpha(3, 2)).toBe(1);
    expect(extraLabelAlpha(3, Infinity)).toBe(0);
  });

  it("labels past the budget appear faded once zoomed in far enough", () => {
    const wide = { width: 4000, height: 4000 };
    const many = Array.from({ length: 60 }, (_, i) => placed(node(`n${i}`, { decay: 1 - i / 80 }), (i % 10) * 150, Math.floor(i / 10) * 150));
    const at = (k: number) => selectLabels(many, { k, x: 0, y: 0 }, wide, new Set(), measure, 14, 1);

    // Below the fade start: only the budget, all fully opaque.
    expect(at(0.6)).toHaveLength(labelBudget(0.6, 60));
    expect(at(0.6).every((l) => l.alpha === 1)).toBe(true);
    // Partway: everything is labelled, the extras at half strength.
    const partway = at(0.85);
    expect(partway).toHaveLength(60);
    expect(partway.filter((l) => l.alpha === 1)).toHaveLength(labelBudget(0.85, 60));
    expect(partway.at(-1)?.alpha).toBeCloseTo(0.5);
  });
});

describe("groups", () => {
  const n = node("x", { title: "Design system tokens", aliases: ["DS"], state: "parked" });

  it("matches all words against title and aliases, plus state: terms", () => {
    expect(matchesQuery(n, "design tokens")).toBe(true);
    expect(matchesQuery(n, "ds")).toBe(true);
    expect(matchesQuery(n, "design state:parked")).toBe(true);
    expect(matchesQuery(n, "design state:active")).toBe(false);
    expect(matchesQuery(n, "   ")).toBe(false);
  });

  it("paints by the first matching group, then by state if asked, else neutral", () => {
    const groups = [
      { id: "1", query: "nothing here", slot: 0 },
      { id: "2", query: "design", slot: 3 },
    ];
    expect(paintFor(n, groups, { colorByState: true })).toEqual({ kind: "group", slot: 3 });
    expect(paintFor(n, [], { colorByState: true })).toEqual({ kind: "state", state: "parked" });
    expect(paintFor(n, [], { colorByState: false })).toEqual({ kind: "neutral" });
  });
});

describe("node size options", () => {
  it("sizes by aliveness, links or ideas", () => {
    const n = node("a", { decay: 0.5, ideaCount: 16 });
    expect(sizeValue(n, "alive", 3)).toBe(2);
    expect(sizeValue(n, "links", 3)).toBe(3);
    expect(sizeValue(n, "ideas", 3)).toBe(16);
  });

  it("scales radius by area and by the node-size setting", () => {
    const values = [0, 25, 100];
    const r = valueRadius(values, (v) => v, 1);
    expect(r(0)).toBe(R_MIN);
    expect(r(100)).toBe(R_MAX);
    expect(r(25)).toBeCloseTo(R_MIN + (R_MAX - R_MIN) * 0.5);
    expect(valueRadius(values, (v) => v, 2)(100)).toBe(R_MAX * 2);
  });
});

describe("local graph", () => {
  const data: GraphData = {
    nodes: [node("a"), node("b"), node("c"), node("d"), node("gone", { state: "dead" })],
    edges: [edge("ab", "a", "b"), edge("bc", "b", "c"), edge("cd", "c", "d"), edge("ag", "a", "gone")],
    generatedAt: "2026-10-20T00:00:00Z",
  };

  it("collects topics within the depth", () => {
    const ids = (d: number) => neighbourhood(data, "a", d).nodes.map((n) => n.id).sort();
    expect(ids(1)).toEqual(["a", "b", "gone"]);
    expect(ids(2)).toEqual(["a", "b", "c", "gone"]);
  });

  it("applies the state filters but always keeps the centre", () => {
    const local = localGraph(data, DEFAULT_VIEW, "gone", 2, NOW);
    expect(local.nodes.map((n) => n.id).sort()).toEqual(["a", "b", "gone"]);
    expect(localGraph(data, DEFAULT_VIEW, "missing", 1, NOW).nodes).toEqual([]);
  });
});

describe("timelapse", () => {
  const nodes = [
    node("new", { createdAt: "2026-07-01T00:00:00Z" }),
    node("undated", { createdAt: "not a date" }),
    node("old", { createdAt: "2026-01-01T00:00:00Z" }),
    node("mid", { createdAt: "2026-03-01T00:00:00Z" }),
  ];

  it("spans the creation dates", () => {
    expect(timeSpan(nodes)).toEqual({ start: Date.parse("2026-01-01T00:00:00Z"), end: Date.parse("2026-07-01T00:00:00Z") });
    expect(timeSpan([node("x", { createdAt: "" })])).toBeNull();
  });

  it("orders dated topics oldest first and counts how many existed at a moment", () => {
    const ordered = byCreation(nodes);
    expect(ordered.map((n) => n.id)).toEqual(["old", "mid", "new"]);
    const span = timeSpan(nodes);
    if (!span) throw new Error("span");
    expect(revealedCount(ordered, timeAt(span, 0))).toBe(1);
    expect(revealedCount(ordered, Date.parse("2026-03-01T00:00:00Z"))).toBe(2);
    expect(revealedCount(ordered, timeAt(span, 1))).toBe(3);
    expect(revealedCount(ordered, Date.parse("2025-01-01T00:00:00Z"))).toBe(0);
  });
});

describe("keyboardNav", () => {
  const center = placed(node("c", { decay: 1, ideaCount: 50 }), 0, 0);
  const right = placed(node("r"), 100, 10);
  const farRight = placed(node("fr"), 300, 0);
  const up = placed(node("u"), 5, -80);
  const nodes = [center, right, farRight, up];

  it("moves to the nearest node in the arrow's direction", () => {
    expect(moveFocus(nodes, "c", "right")).toBe("r");
    expect(moveFocus(nodes, "c", "up")).toBe("u");
    expect(moveFocus(nodes, "r", "right")).toBe("fr");
  });

  it("stays put when nothing lies that way, and starts at the most important node", () => {
    expect(moveFocus(nodes, "c", "left")).toBe("c");
    expect(moveFocus(nodes, null, "down")).toBe("c");
    expect(moveFocus([], null, "down")).toBeNull();
  });

  it("tabs through nodes by importance and wraps", () => {
    const first = cycleFocus(nodes, null, false);
    expect(first).toBe("c");
    expect(cycleFocus(nodes, first, true)).not.toBe("c");
    expect(cycleFocus([], null, false)).toBeNull();
  });
});
