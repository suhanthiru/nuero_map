/** A key chord. `mod` is Ctrl on Windows/Linux and Cmd on macOS. */
export interface Hotkey {
  readonly key: string;
  readonly mod?: boolean;
  readonly shift?: boolean;
  readonly alt?: boolean;
}

export interface KeyLike {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
}

const KEY_LABEL: Readonly<Record<string, string>> = {
  ArrowLeft: "←",
  ArrowRight: "→",
  ArrowUp: "↑",
  ArrowDown: "↓",
  Tab: "Tab",
  Enter: "Enter",
  Escape: "Esc",
  " ": "Space",
};

/** Modifiers must match exactly, so Ctrl+Tab and Ctrl+Shift+Tab stay distinct. */
export function matchesHotkey(e: KeyLike, h: Hotkey): boolean {
  return (
    e.key.toLowerCase() === h.key.toLowerCase() &&
    (e.ctrlKey || e.metaKey) === !!h.mod &&
    e.shiftKey === !!h.shift &&
    e.altKey === !!h.alt
  );
}

/** The chips to show for a hotkey, e.g. ["Ctrl", "Shift", "F"]. */
export function hotkeyParts(h: Hotkey): string[] {
  const key = KEY_LABEL[h.key] ?? (h.key.length === 1 ? h.key.toUpperCase() : h.key);
  return [...(h.mod ? ["Ctrl"] : []), ...(h.alt ? ["Alt"] : []), ...(h.shift ? ["Shift"] : []), key];
}

export function hotkeyLabel(h: Hotkey): string {
  return hotkeyParts(h).join("+");
}

const WORD_START = /[\s\-/:(]/;

/**
 * Subsequence match: every query character appears in order. Higher is better;
 * consecutive runs and matches at word starts score more. Null when it doesn't match.
 */
export function fuzzyScore(query: string, text: string): number | null {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const t = text.toLowerCase();
  let score = 0;
  let run = 0;
  let from = 0;
  for (const ch of q) {
    if (ch === " ") {
      run = 0;
      continue;
    }
    const at = t.indexOf(ch, from);
    if (at === -1) return null;
    run = at === from && from > 0 ? run + 1 : 1;
    const wordStart = at === 0 || WORD_START.test(t[at - 1]);
    score += 1 + run * 2 + (wordStart ? 3 : 0);
    from = at + 1;
  }
  // Prefer shorter names when the match is otherwise equal.
  return score - t.length * 0.01;
}

/**
 * Palette order. With no query: recently used first (most recent on top), then A–Z.
 * With a query: best fuzzy match first, recent use breaking ties.
 */
export function rankByName<T extends { readonly id: string; readonly name: string }>(
  items: readonly T[],
  query: string,
  recent: readonly string[],
): T[] {
  const recency = (id: string) => {
    const at = recent.indexOf(id);
    return at === -1 ? Infinity : at;
  };
  if (!query.trim()) {
    return [...items].sort((a, b) => recency(a.id) - recency(b.id) || a.name.localeCompare(b.name));
  }
  return items
    .map((item) => ({ item, score: fuzzyScore(query, item.name) }))
    .filter((r): r is { item: T; score: number } => r.score !== null)
    .sort((a, b) => b.score - a.score || recency(a.item.id) - recency(b.item.id) || a.item.name.localeCompare(b.item.name))
    .map((r) => r.item);
}
