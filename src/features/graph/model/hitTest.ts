import { quadtree, type Quadtree, type QuadtreeLeaf } from "d3-quadtree";
import type { GraphEdge } from "../../../api/contract";
import { edgeDistance } from "./geometry";
import type { Hit, PlacedNode, Point } from "./types";
import { drawnRadius, minEdgeStrength } from "./scales";

/** Pointer slack in screen pixels: hit targets are bigger than the marks. */
export const NODE_SLACK_PX = 6;
export const EDGE_SLACK_PX = 5;

export interface HitIndex {
  readonly tree: Quadtree<PlacedNode>;
  readonly byId: ReadonlyMap<string, PlacedNode>;
  readonly edges: readonly GraphEdge[];
  /** Largest radius, so the quadtree search reaches big nodes (node size is user-scaled). */
  readonly maxR: number;
}

export function buildHitIndex(nodes: readonly PlacedNode[], edges: readonly GraphEdge[]): HitIndex {
  const tree = quadtree<PlacedNode>()
    .x((n) => n.x)
    .y((n) => n.y)
    .addAll([...nodes]);
  const maxR = nodes.reduce((m, n) => Math.max(m, n.r), 0);
  return { tree, byId: new Map(nodes.map((n) => [n.node.id, n])), edges, maxR };
}

/**
 * The node containing the point (within `slack`), preferring the one the point is deepest
 * inside. Nearest-centre alone misses the rim of a big node next to a small one. Nodes are
 * hit at the size they are drawn at zoom k.
 */
function nodeAt(index: HitIndex, world: Point, slack: number, k: number): PlacedNode | null {
  const reach = drawnRadius(index.maxR, k) + slack;
  let best: PlacedNode | null = null;
  let bestGap = Infinity;
  index.tree.visit((quad, x0, y0, x1, y1) => {
    if ("data" in quad) {
      for (let leaf: QuadtreeLeaf<PlacedNode> | undefined = quad; leaf; leaf = leaf.next) {
        const n = leaf.data;
        const gap = Math.hypot(n.x - world.x, n.y - world.y) - drawnRadius(n.r, k);
        if (gap <= slack && gap < bestGap) {
          best = n;
          bestGap = gap;
        }
      }
    }
    // Skip quadrants that can't hold a node reaching the point.
    return x0 > world.x + reach || x1 < world.x - reach || y0 > world.y + reach || y1 < world.y - reach;
  });
  return best;
}

/** Node under the point beats edge under the point. `world` is in world units; k is zoom. */
export function hitTest(index: HitIndex, world: Point, k: number): Hit {
  const node = nodeAt(index, world, NODE_SLACK_PX / k, k);
  if (node) return { kind: "node", id: node.node.id };
  const edgeSlack = EDGE_SLACK_PX / k;
  const minStrength = minEdgeStrength(k);
  let best: { id: string; d: number } | null = null;
  for (const e of index.edges) {
    if (e.strength < minStrength) continue; // not drawn at this zoom
    const a = index.byId.get(e.source);
    const b = index.byId.get(e.target);
    if (!a || !b) continue;
    if (world.x < Math.min(a.x, b.x) - edgeSlack || world.x > Math.max(a.x, b.x) + edgeSlack) continue;
    const d = edgeDistance(world, a, b);
    if (d <= edgeSlack && (!best || d < best.d)) best = { id: e.id, d };
  }
  return best ? { kind: "edge", id: best.id } : { kind: "none" };
}
