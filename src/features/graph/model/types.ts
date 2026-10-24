import type { GraphEdge, GraphNode, TopicState } from "../../../api/contract";

export type TimeRange = "30d" | "90d" | "1y" | "all";

/** What the graph filters control. */
export interface GraphView {
  readonly states: readonly TopicState[];
  readonly range: TimeRange;
  readonly showWeak: boolean;
  /** Only topics matching this (see groups.matchesQuery); empty shows all. */
  readonly query?: string;
  /** Show topics with no visible connections. */
  readonly showOrphans?: boolean;
}

export interface VisibleGraph {
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
}

/** A node with a layout position and drawn radius (world units). */
export interface PlacedNode {
  readonly node: GraphNode;
  readonly x: number;
  readonly y: number;
  readonly r: number;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** d3-zoom transform: screen = world * k + (x, y). */
export interface ViewTransform {
  readonly k: number;
  readonly x: number;
  readonly y: number;
}

export type Hit =
  | { readonly kind: "node"; readonly id: string }
  | { readonly kind: "edge"; readonly id: string }
  | { readonly kind: "none" };

export const DEFAULT_VIEW: GraphView = {
  states: ["active", "parked", "done"],
  range: "all",
  showWeak: false,
};
