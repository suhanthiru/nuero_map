import { create } from "zustand";
import { TOPIC_STATES, type TopicState, type TopicSummary } from "../../api/contract";

const STORAGE_KEY = "neural-map.explorer";

export type ExplorerSort = "name" | "name-desc" | "alive" | "recent" | "ideas";

export const SORT_LABEL: Readonly<Record<ExplorerSort, string>> = {
  name: "Title (A to Z)",
  "name-desc": "Title (Z to A)",
  alive: "Most alive",
  recent: "Recently active",
  ideas: "Most ideas",
};

export const SORTS = Object.keys(SORT_LABEL) as ExplorerSort[];

export function sortTopics(topics: readonly TopicSummary[], sort: ExplorerSort): TopicSummary[] {
  const byName = (a: TopicSummary, b: TopicSummary) => a.title.localeCompare(b.title);
  const compare: Record<ExplorerSort, (a: TopicSummary, b: TopicSummary) => number> = {
    name: byName,
    "name-desc": (a, b) => byName(b, a),
    alive: (a, b) => b.decay - a.decay || byName(a, b),
    recent: (a, b) => b.lastActiveAt.localeCompare(a.lastActiveAt) || byName(a, b),
    ideas: (a, b) => b.ideaCount - a.ideaCount || byName(a, b),
  };
  return [...topics].sort(compare[sort]);
}

interface Persisted {
  readonly sort: ExplorerSort;
  /** State folders the user folded. Dead starts folded. */
  readonly collapsed: readonly TopicState[];
}

interface ExplorerState extends Persisted {
  /** Set by "reveal active topic"; the explorer scrolls to and focuses that row, then clears it. */
  readonly revealPending: boolean;
  setSort: (sort: ExplorerSort) => void;
  toggleFolder: (state: TopicState) => void;
  setAllCollapsed: (collapsed: boolean) => void;
  expand: (state: TopicState) => void;
  requestReveal: () => void;
  revealDone: () => void;
}

const DEFAULTS: Persisted = { sort: "name", collapsed: ["dead"] };

function load(): Persisted {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<Persisted> | null;
    if (!parsed) return DEFAULTS;
    return {
      sort: SORTS.includes(parsed.sort as ExplorerSort) ? (parsed.sort as ExplorerSort) : DEFAULTS.sort,
      collapsed: Array.isArray(parsed.collapsed) ? TOPIC_STATES.filter((st) => parsed.collapsed?.includes(st)) : DEFAULTS.collapsed,
    };
  } catch {
    return DEFAULTS;
  }
}

export const useExplorer = create<ExplorerState>((set) => ({
  ...load(),
  revealPending: false,
  setSort: (sort) => set({ sort }),
  toggleFolder: (state) =>
    set((s) => ({ collapsed: s.collapsed.includes(state) ? s.collapsed.filter((c) => c !== state) : [...s.collapsed, state] })),
  setAllCollapsed: (collapsed) => set({ collapsed: collapsed ? [...TOPIC_STATES] : [] }),
  expand: (state) => set((s) => ({ collapsed: s.collapsed.filter((c) => c !== state) })),
  requestReveal: () => set({ revealPending: true }),
  revealDone: () => set({ revealPending: false }),
}));

useExplorer.subscribe((s) => {
  try {
    const persisted: Persisted = { sort: s.sort, collapsed: s.collapsed };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
  } catch {
    // Storage unavailable: the explorer just won't remember its folds.
  }
});

export function resetExplorer(): void {
  useExplorer.setState({ ...DEFAULTS, revealPending: false });
}
