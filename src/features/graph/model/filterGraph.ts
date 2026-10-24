import type { GraphData, GraphNode } from "../../../api/contract";
import { matchesQuery } from "./groups";
import type { GraphView, TimeRange, VisibleGraph } from "./types";

const DAY_MS = 86_400_000;
const RANGE_DAYS: Readonly<Record<TimeRange, number | null>> = { "30d": 30, "90d": 90, "1y": 365, all: null };

function inRange(node: GraphNode, range: TimeRange, now: number): boolean {
  const days = RANGE_DAYS[range];
  if (days === null) return true;
  const last = Date.parse(node.lastActiveAt);
  return Number.isNaN(last) || now - last <= days * DAY_MS;
}

/** Nodes matching the view, and only edges whose both ends are visible. Pure. */
export function filterGraph(data: GraphData, view: GraphView, now: number = Date.now()): VisibleGraph {
  const query = view.query?.trim() ?? "";
  const candidates = data.nodes.filter(
    (n) => view.states.includes(n.state) && inRange(n, view.range, now) && (!query || matchesQuery(n, query)),
  );
  const candidateIds = new Set(candidates.map((n) => n.id));
  const edges = data.edges.filter(
    (e) => candidateIds.has(e.source) && candidateIds.has(e.target) && (view.showWeak || e.kind !== "semantic"),
  );
  if (view.showOrphans !== false) return { nodes: candidates, edges };
  const linked = new Set(edges.flatMap((e) => [e.source, e.target]));
  return { nodes: candidates.filter((n) => linked.has(n.id)), edges };
}

/** Topics within `depth` hops of `centerId` (the local graph). Pure. */
export function neighbourhood(graph: VisibleGraph, centerId: string, depth: number): VisibleGraph {
  const adj = neighbours(graph);
  const keep = new Set([centerId]);
  let frontier = [centerId];
  for (let d = 0; d < depth; d += 1) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const n of adj.get(id) ?? []) {
        if (!keep.has(n)) {
          keep.add(n);
          next.push(n);
        }
      }
    }
    frontier = next;
  }
  return {
    nodes: graph.nodes.filter((n) => keep.has(n.id)),
    edges: graph.edges.filter((e) => keep.has(e.source) && keep.has(e.target)),
  };
}

/**
 * The local graph around one topic: the global filters (minus search), within `depth`
 * hops. The centre always shows, even when its own state or age is filtered out.
 */
export function localGraph(data: GraphData, view: GraphView, centerId: string, depth: number, now: number = Date.now()): VisibleGraph {
  const center = data.nodes.find((n) => n.id === centerId);
  if (!center) return { nodes: [], edges: [] };
  const visible = filterGraph(data, { ...view, query: "", showOrphans: true }, now);
  if (visible.nodes.some((n) => n.id === centerId)) return neighbourhood(visible, centerId, depth);
  const ids = new Set(visible.nodes.map((n) => n.id));
  const centerEdges = data.edges.filter((e) => {
    const other = e.source === centerId ? e.target : e.target === centerId ? e.source : null;
    return other !== null && ids.has(other) && (view.showWeak || e.kind !== "semantic");
  });
  return neighbourhood({ nodes: [...visible.nodes, center], edges: [...visible.edges, ...centerEdges] }, centerId, depth);
}

/** Adjacency: node id → ids of visible neighbours. */
export function neighbours(graph: VisibleGraph): ReadonlyMap<string, ReadonlySet<string>> {
  const map = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    const set = map.get(a) ?? new Set<string>();
    set.add(b);
    map.set(a, set);
  };
  graph.edges.forEach((e) => {
    link(e.source, e.target);
    link(e.target, e.source);
  });
  return map;
}

/** Case-insensitive match on title and aliases, best (prefix) matches first. */
export function searchNodes(nodes: readonly GraphNode[], query: string, limit = 8): GraphNode[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const score = (n: GraphNode): number => {
    const names = [n.title, ...n.aliases].map((s) => s.toLowerCase());
    if (names.some((s) => s.startsWith(q))) return 2;
    if (names.some((s) => s.includes(q))) return 1;
    return 0;
  };
  return nodes
    .map((n) => ({ n, s: score(n) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || b.n.decay - a.n.decay)
    .slice(0, limit)
    .map((x) => x.n);
}
