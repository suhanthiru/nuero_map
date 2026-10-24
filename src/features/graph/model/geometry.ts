import type { Point, ViewTransform } from "./types";

export function toScreen(p: Point, t: ViewTransform): Point {
  return { x: p.x * t.k + t.x, y: p.y * t.k + t.y };
}

export function toWorld(p: Point, t: ViewTransform): Point {
  return { x: (p.x - t.x) / t.k, y: (p.y - t.y) / t.k };
}

/** Distance from p to the straight link a→b. */
export function edgeDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export interface Bounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export function boundsOf(points: readonly { x: number; y: number; r: number }[]): Bounds | null {
  if (points.length === 0) return null;
  return points.reduce<Bounds>(
    (b, p) => ({
      minX: Math.min(b.minX, p.x - p.r),
      minY: Math.min(b.minY, p.y - p.r),
      maxX: Math.max(b.maxX, p.x + p.r),
      maxY: Math.max(b.maxY, p.y + p.r),
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  );
}

/** Transform that fits `bounds` inside a width×height viewport with padding. */
export function fitTransform(bounds: Bounds | null, width: number, height: number, padding = 48, maxK = 2.5): ViewTransform {
  if (!bounds || width <= 0 || height <= 0) return { k: 1, x: width / 2, y: height / 2 };
  const w = Math.max(1, bounds.maxX - bounds.minX);
  const h = Math.max(1, bounds.maxY - bounds.minY);
  const k = Math.min(maxK, (width - padding * 2) / w, (height - padding * 2) / h);
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  return { k, x: width / 2 - cx * k, y: height / 2 - cy * k };
}
