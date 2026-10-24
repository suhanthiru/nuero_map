import type { Point } from "../model/types";

/**
 * Last known layout position per topic, per graph instance ("global", "local"), so a
 * graph doesn't reshuffle when you leave and come back or change a filter. Session-only.
 */
const caches = new Map<string, Map<string, Point>>();

function cache(namespace: string): Map<string, Point> {
  let c = caches.get(namespace);
  if (!c) {
    c = new Map();
    caches.set(namespace, c);
  }
  return c;
}

export function cachedPosition(id: string, namespace = "global"): Point | undefined {
  return cache(namespace).get(id);
}

export function rememberPositions(points: Iterable<{ id: string; x: number; y: number }>, namespace = "global"): void {
  const c = cache(namespace);
  for (const p of points) c.set(p.id, { x: p.x, y: p.y });
}

export function clearPositions(namespace?: string): void {
  if (namespace) caches.delete(namespace);
  else caches.clear();
}
