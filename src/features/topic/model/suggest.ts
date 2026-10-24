import type { LinkTarget } from "./linkTarget";

const SUGGEST_LIMIT = 8;

/** Topics whose title or alias contains the query; prefix matches and livelier topics first. */
export function suggestTopics<T extends LinkTarget>(topics: readonly T[], query: string, limit = SUGGEST_LIMIT): T[] {
  const q = query.trim().toLowerCase();
  const score = (t: T): number => {
    if (!q) return 1;
    const names = [t.title, ...t.aliases].map((n) => n.toLowerCase());
    if (names.some((n) => n.startsWith(q))) return 2;
    return names.some((n) => n.includes(q)) ? 1 : 0;
  };
  return topics
    .map((t) => ({ t, score: score(t) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || b.t.decay - a.t.decay)
    .slice(0, limit)
    .map((x) => x.t);
}
