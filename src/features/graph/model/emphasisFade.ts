//! Eased emphasis: when a topic is hovered or selected, everything outside its
//! neighbourhood fades down over a short time instead of switching at once.
//! Pure: the caller supplies the clock.

/** How long a fade takes, in ms. Reduced motion uses 0 (instant). */
export const FADE_MS = 200;

/**
 * A fade toward `to` (null lights everything). Each topic's level is 1 when lit and 0
 * when dimmed; `from` holds the levels at the moment the fade started.
 */
export interface Fade {
  readonly from: ReadonlyMap<string, number>;
  readonly to: ReadonlySet<string> | null;
  readonly startedAt: number;
  readonly duration: number;
}

function targetLevel(id: string, to: ReadonlySet<string> | null): number {
  return to === null || to.has(id) ? 1 : 0;
}

function progress(fade: Fade, now: number): number {
  if (fade.duration <= 0) return 1;
  return Math.min(1, Math.max(0, (now - fade.startedAt) / fade.duration));
}

/** Ease-out cubic: quick to respond, gentle to land. */
function ease(p: number): number {
  return 1 - Math.pow(1 - p, 3);
}

/** A topic's emphasis level (0 dimmed … 1 lit) at time `now`. */
export function levelAt(fade: Fade | null, id: string, now: number): number {
  if (!fade) return 1;
  const target = targetLevel(id, fade.to);
  const from = fade.from.get(id) ?? target;
  const p = progress(fade, now);
  return p >= 1 ? target : from + (target - from) * ease(p);
}

function sameSet(a: ReadonlySet<string> | null, b: ReadonlySet<string> | null): boolean {
  if (a === b) return true;
  if (a === null || b === null || a.size !== b.size) return false;
  for (const id of a) if (!b.has(id)) return false;
  return true;
}

/**
 * Starts fading toward `to` from wherever each topic is right now, so changing the
 * hovered topic mid-fade never makes anything jump. The same emphasis keeps the
 * running fade.
 */
export function startFade(prev: Fade | null, ids: readonly string[], to: ReadonlySet<string> | null, now: number, duration: number): Fade {
  if (prev && sameSet(prev.to, to)) return prev;
  const from = new Map(ids.map((id) => [id, levelAt(prev, id, now)] as const));
  return { from, to, startedAt: now, duration };
}

export function fadeDone(fade: Fade, now: number): boolean {
  return progress(fade, now) >= 1;
}

/** Opacity for a level: `dim` when fully dimmed, 1 when lit. */
export function litAlpha(level: number, dim: number): number {
  return dim + (1 - dim) * level;
}
