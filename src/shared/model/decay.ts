/** Fraction of a mention's weight left after `daysIdle` days with the given half-life. */
export function retention(daysIdle: number, halfLifeDays: number): number {
  if (halfLifeDays <= 0) return 0;
  return Math.pow(0.5, Math.max(0, daysIdle) / halfLifeDays);
}

export interface RetentionPoint {
  readonly days: number;
  readonly percent: number;
}

const PREVIEW_DAYS: readonly number[] = [7, 30, 90];

/** "Idle 7d → 71%, 30d → 23%, 90d → 1%" style preview for the settings page. */
export function retentionPreview(halfLifeDays: number, days: readonly number[] = PREVIEW_DAYS): RetentionPoint[] {
  return days.map((d) => ({ days: d, percent: Math.round(retention(d, halfLifeDays) * 100) }));
}

export type DecayBucket = "hot" | "warm" | "fading" | "cold";

/** Coarse label for a 0..1 normalized decay score. */
export function decayBucket(decay: number): DecayBucket {
  if (decay >= 0.75) return "hot";
  if (decay >= 0.4) return "warm";
  if (decay >= 0.15) return "fading";
  return "cold";
}
