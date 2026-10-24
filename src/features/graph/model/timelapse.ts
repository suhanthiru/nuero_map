import type { GraphNode } from "../../../api/contract";

export interface TimeSpan {
  readonly start: number;
  readonly end: number;
}

type Dated = Pick<GraphNode, "id" | "createdAt">;

function createdMs(node: Pick<GraphNode, "createdAt">): number {
  return Date.parse(node.createdAt);
}

/** First and last topic creation times, or null when nothing has a usable date. */
export function timeSpan(nodes: readonly Pick<GraphNode, "createdAt">[]): TimeSpan | null {
  const times = nodes.map(createdMs).filter((t) => !Number.isNaN(t));
  if (times.length === 0) return null;
  return { start: Math.min(...times), end: Math.max(...times) };
}

/** The moment `progress` (0..1) of the way through the span. */
export function timeAt(span: TimeSpan, progress: number): number {
  return span.start + (span.end - span.start) * Math.min(1, Math.max(0, progress));
}

/** Dated topics, oldest first (undated ones are left out of the replay). */
export function byCreation<T extends Dated>(nodes: readonly T[]): T[] {
  return nodes
    .map((n) => ({ n, t: createdMs(n) }))
    .filter((x) => !Number.isNaN(x.t))
    .sort((a, b) => a.t - b.t)
    .map((x) => x.n);
}

/** How many of `ordered` (from byCreation) existed at `time`. Binary search. */
export function revealedCount(ordered: readonly Dated[], time: number): number {
  let lo = 0;
  let hi = ordered.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (createdMs(ordered[mid]) <= time) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
