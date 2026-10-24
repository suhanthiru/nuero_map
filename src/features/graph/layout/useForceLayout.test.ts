import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { GraphEdge, GraphNode } from "../../../api/contract";
import type { VisibleGraph } from "../model/types";
import { DEFAULT_SETTINGS } from "../state/graphSettingsStore";
import { cachedPosition, clearPositions, rememberPositions } from "./positionCache";
import { useForceLayout, type LayoutOptions } from "./useForceLayout";

function node(id: string): GraphNode {
  return {
    id,
    title: id,
    aliases: [],
    state: "active",
    decay: 0.5,
    ideaCount: 3,
    summary: "",
    createdAt: "2026-01-01T00:00:00Z",
    lastActiveAt: "2026-10-01T00:00:00Z",
    checkInAt: null,
    recentlyLinked: false,
  };
}

function graphOf(ids: string[], links: [string, string][]): VisibleGraph {
  const edges: GraphEdge[] = links.map(([a, b]) => ({
    id: `${a}-${b}`, source: a, target: b, kind: "cooccurrence", strength: 0.5, evidenceCount: 1, lastSeenAt: "2026-10-01T00:00:00Z",
  }));
  return { nodes: ids.map(node), edges };
}

// Reduced motion lays out synchronously, so no animation frames are needed in the test.
const OPTS: LayoutOptions = { forces: DEFAULT_SETTINGS.forces, sizeBy: "alive", nodeScale: 1, reducedMotion: true, namespace: "test" };

describe("useForceLayout", () => {
  it("marks the layout stale until positions for a new graph arrive", () => {
    clearPositions("test");
    const small = graphOf(["a", "b"], [["a", "b"]]);
    const big = graphOf(["a", "b", "c", "d"], [["a", "b"], ["b", "c"], ["c", "d"]]);
    const seen: { graph: VisibleGraph; ready: boolean; count: number }[] = [];
    const { rerender } = renderHook(({ g }) => {
      const layout = useForceLayout(g, OPTS);
      seen.push({ graph: g, ready: layout.ready, count: layout.placed.length });
      return layout;
    }, { initialProps: { g: small } });

    expect(seen.at(-1)).toMatchObject({ ready: true, count: 2 });
    seen.length = 0;
    rerender({ g: big });

    // The first render with the new graph still holds the old positions, and says so.
    expect(seen[0]).toMatchObject({ graph: big, ready: false, count: 2 });
    expect(seen.at(-1)).toMatchObject({ graph: big, ready: true, count: 4 });
  });

  it("moves a dragged topic and remembers where it was dropped", () => {
    clearPositions("test");
    const g = graphOf(["a", "b", "c"], [["a", "b"], ["b", "c"]]);
    const { result } = renderHook(() => useForceLayout(g, OPTS));

    act(() => {
      result.current.drag.start("a");
      result.current.drag.move("a", 500, -400);
    });
    const a = result.current.placed.find((p) => p.node.id === "a");
    expect(a).toMatchObject({ x: 500, y: -400 });

    act(() => result.current.drag.end("a"));
    // With reduced motion a released topic stays exactly where it was dropped.
    expect(result.current.placed.find((p) => p.node.id === "a")).toMatchObject({ x: 500, y: -400 });
    expect(cachedPosition("a", "test")).toEqual({ x: 500, y: -400 });
  });

  it("shows a new topic beside the topic it links to on the very first frame", () => {
    clearPositions("test");
    // Nine remembered topics and one newcomer: well clear of the "mostly known" warm-start cut-off.
    const placedIds = ["a", "b", "c", "d", "e", "f", "g", "h", "i"];
    rememberPositions(placedIds.map((id, i) => ({ id, x: i === 0 ? 500 : -500 + i * 40, y: i === 0 ? 500 : -500 })), "test");
    const g = graphOf([...placedIds, "new"], [["new", "a"], ["b", "d"]]);
    // Animated layout: the first frame is shown before the simulation runs a single tick.
    const { result } = renderHook(() => useForceLayout(g, { ...OPTS, reducedMotion: false }));

    const p = result.current.placed.find((n) => n.node.id === "new");
    expect(Math.hypot((p?.x ?? 0) - 500, (p?.y ?? 0) - 500)).toBeLessThan(40);
  });
});
