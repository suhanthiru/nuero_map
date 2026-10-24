import { importance } from "./scales";
import type { PlacedNode } from "./types";

export type Direction = "up" | "down" | "left" | "right";

const DIRECTION_VECTOR: Readonly<Record<Direction, { x: number; y: number }>> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

/** Only nodes within this angle of the arrow direction are candidates (±60°). */
const CONE_COS = Math.cos(Math.PI / 3);

/**
 * Nearest node in the arrow's direction, favouring ones straight ahead.
 * With nothing focused, starts from the most important node.
 */
export function moveFocus(nodes: readonly PlacedNode[], currentId: string | null, dir: Direction): string | null {
  if (nodes.length === 0) return null;
  const current = nodes.find((n) => n.node.id === currentId);
  if (!current) return mostImportant(nodes);
  const v = DIRECTION_VECTOR[dir];
  let best: { id: string; cost: number } | null = null;
  for (const n of nodes) {
    if (n === current) continue;
    const dx = n.x - current.x;
    const dy = n.y - current.y;
    const dist = Math.hypot(dx, dy);
    if (dist === 0) continue;
    const cos = (dx * v.x + dy * v.y) / dist;
    if (cos < CONE_COS) continue;
    // Off-axis nodes cost more, so straight-ahead wins ties of distance.
    const cost = dist * (2 - cos);
    if (!best || cost < best.cost) best = { id: n.node.id, cost };
  }
  return best ? best.id : current.node.id;
}

export function mostImportant(nodes: readonly PlacedNode[]): string | null {
  return nodes.reduce<PlacedNode | null>((best, n) => (!best || importance(n.node) > importance(best.node) ? n : best), null)?.node.id ?? null;
}

/** Tab order: by importance, wrapping. */
export function cycleFocus(nodes: readonly PlacedNode[], currentId: string | null, backwards: boolean): string | null {
  if (nodes.length === 0) return null;
  const order = [...nodes].sort((a, b) => importance(b.node) - importance(a.node)).map((n) => n.node.id);
  const i = currentId ? order.indexOf(currentId) : -1;
  if (i === -1) return order[0];
  const next = (i + (backwards ? -1 : 1) + order.length) % order.length;
  return order[next];
}
