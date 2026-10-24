/** Small seeded PRNG (mulberry32) so mock data is identical on every run. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick<T>(rand: () => number, items: readonly T[]): T {
  return items[Math.floor(rand() * items.length)];
}

const DAY_MS = 86_400_000;

/** ISO timestamp `days` before the fixed mock "now". */
export function daysAgo(days: number, now: number = MOCK_NOW): string {
  return new Date(now - days * DAY_MS).toISOString();
}

/** Fixed clock for fixtures so relative dates never drift. */
export const MOCK_NOW = Date.parse("2026-09-28T12:00:00Z");
