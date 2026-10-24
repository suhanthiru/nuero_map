import type { GraphNode } from "../../../api/contract";

export const R_MIN = 4;
export const R_MAX = 26;
const ALPHA_FLOOR = 0.4;
export const EDGE_WIDTH_MIN = 0.6;
export const EDGE_WIDTH_MAX = 4;
/** Edge widths are quantized so each (kind, bucket) is drawn in one canvas path. */
export const EDGE_BUCKETS = 4;

/** How "alive" a topic is: recency (decay) weighted by how much was said. */
export function importance(node: Pick<GraphNode, "decay" | "ideaCount">): number {
  return node.decay * Math.sqrt(Math.max(0, node.ideaCount));
}

/** Radius by area (sqrt), so a node twice as important has twice the ink, not four times. */
export function radiusScale(nodes: readonly Pick<GraphNode, "decay" | "ideaCount">[]): (n: Pick<GraphNode, "decay" | "ideaCount">) => number {
  return valueRadius(nodes, importance, 1);
}

/** Generic area scale over any per-node value, times a user size multiplier. */
export function valueRadius<T>(nodes: readonly T[], value: (n: T) => number, scale: number): (n: T) => number {
  const max = nodes.reduce((m, n) => Math.max(m, value(n)), 0);
  return (n) => {
    const base = max <= 0 ? R_MIN : R_MIN + (R_MAX - R_MIN) * Math.sqrt(Math.max(0, value(n)) / max);
    return base * scale;
  };
}

export type SizeBy = "alive" | "links" | "ideas";

/** What node size means: aliveness (default), number of connections, or ideas. */
export function sizeValue(node: Pick<GraphNode, "decay" | "ideaCount">, sizeBy: SizeBy, degree: number): number {
  if (sizeBy === "links") return degree;
  if (sizeBy === "ideas") return node.ideaCount;
  return importance(node);
}

/** Smallest on-screen radius: zoomed far out, a topic stays a visible dot. */
export const MIN_NODE_PX = 2;

/**
 * Semantic zoom: the radius a topic is drawn with at zoom k, in world units. Zooming in,
 * topics grow only with √k on screen, so the map opens up instead of the dots ballooning;
 * zooming out they shrink with the map, down to MIN_NODE_PX. Layout keeps the plain radius.
 */
export function drawnRadius(r: number, k: number): number {
  const grown = k > 1 ? r / Math.sqrt(k) : r;
  return Math.max(grown, MIN_NODE_PX / k);
}

/** Fading topics literally fade. */
export function nodeAlpha(decay: number): number {
  return ALPHA_FLOOR + (1 - ALPHA_FLOOR) * Math.min(1, Math.max(0, decay));
}

export function edgeBucket(strength: number): number {
  const s = Math.min(1, Math.max(0, strength));
  return Math.min(EDGE_BUCKETS - 1, Math.floor(s * EDGE_BUCKETS));
}

export function bucketWidth(bucket: number): number {
  return EDGE_WIDTH_MIN + ((EDGE_WIDTH_MAX - EDGE_WIDTH_MIN) * (bucket + 0.5)) / EDGE_BUCKETS;
}

/**
 * Level of detail: zoomed out, only stronger links are drawn so topics stay readable;
 * zooming in reveals the rest. Links of the highlighted topic always draw.
 */
export function minEdgeStrength(k: number): number {
  if (k < 0.45) return 0.6;
  if (k < 0.8) return 0.35;
  if (k < 1.2) return 0.15;
  return 0;
}

/** Links recede when zoomed out. */
export function edgeAlphaForZoom(k: number): number {
  return Math.min(1, Math.max(0.45, k * 1.1));
}
