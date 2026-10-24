import type { Point } from "../model/types";

/** Jitter around a neighbourhood centroid grows with how many topics arrive at once. */
export const SEED_SPREAD = 30;
/** World area set aside per unconnected newcomer on the ring around the graph. */
export const RING_AREA_PER_TOPIC = 60 * 60;

export interface SeedLink {
  readonly source: string;
  readonly target: string;
}

function adjacency(links: readonly SeedLink[]): Map<string, string[]> {
  const adj = new Map<string, string[]>();
  const add = (a: string, b: string) => {
    const list = adj.get(a);
    if (list) list.push(b);
    else adj.set(a, [b]);
  };
  for (const l of links) {
    add(l.source, l.target);
    add(l.target, l.source);
  }
  return adj;
}

function centroid(points: readonly Point[]): Point {
  const sum = points.reduce((s, p) => ({ x: s.x + p.x, y: s.y + p.y }), { x: 0, y: 0 });
  return { x: sum.x / points.length, y: sum.y / points.length };
}

/**
 * Starting positions for topics with no remembered position, so a new topic appears
 * beside the topics it links to instead of flying in from the middle of the map. Working
 * outward from the placed graph, a newcomer starts at the centroid of its placed
 * neighbours (newcomers placed before it count, so a chain attaches link by link). A
 * group with no path to the placed graph starts on a ring just outside it, its first
 * member on the ring and the rest beside it. Returns only the seeded ids; with nothing
 * known yet it returns nothing and the simulation lays out from scratch.
 */
export function seedPositions(
  ids: readonly string[],
  links: readonly SeedLink[],
  known: ReadonlyMap<string, Point>,
  random: () => number = Math.random,
): Map<string, Point> {
  const seeds = new Map<string, Point>();
  if (known.size === 0) return seeds;
  const newcomers = ids.filter((id) => !known.has(id));
  if (newcomers.length === 0) return seeds;

  const adj = adjacency(links);
  const isNewcomer = new Set(newcomers);
  const at = (id: string) => seeds.get(id) ?? known.get(id);
  const spread = SEED_SPREAD * Math.sqrt(newcomers.length);
  const extent = [...known.values()].reduce((m, p) => Math.max(m, Math.hypot(p.x, p.y)), 0);
  const ringWidth = Math.sqrt((RING_AREA_PER_TOPIC * newcomers.length) / Math.PI + extent * extent) - extent;

  const onRing = (): Point => {
    const angle = 2 * Math.PI * random();
    const d = extent + Math.sqrt(random()) * ringWidth;
    return { x: d * Math.cos(angle), y: d * Math.sin(angle) };
  };
  const besideNeighbours = (id: string): Point => {
    const placed = (adj.get(id) ?? []).map(at).filter((p): p is Point => p !== undefined);
    if (placed.length === 0) return onRing();
    const c = centroid(placed);
    return { x: c.x + (random() - 0.5) * spread, y: c.y + (random() - 0.5) * spread };
  };

  // Breadth-first: every queued newcomer has at least one placed neighbour.
  const queue = newcomers.filter((id) => (adj.get(id) ?? []).some((n) => known.has(n)));
  const enqueueNeighbours = (id: string) => {
    for (const n of adj.get(id) ?? []) if (isNewcomer.has(n) && !seeds.has(n)) queue.push(n);
  };
  const grow = () => {
    for (let i = 0; i < queue.length; i++) {
      const id = queue[i];
      if (seeds.has(id)) continue;
      seeds.set(id, besideNeighbours(id));
      enqueueNeighbours(id);
    }
    queue.length = 0;
  };
  grow();
  for (const id of newcomers) {
    if (seeds.has(id)) continue;
    seeds.set(id, onRing());
    enqueueNeighbours(id);
    grow();
  }
  return seeds;
}
