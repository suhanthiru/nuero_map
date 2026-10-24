import { create } from "zustand";
import type { TopicState } from "../../../api/contract";
import type { SizeBy } from "../model/scales";
import type { TimeRange } from "../model/types";

const STORAGE_KEY = "neural-map.graph-settings";
export const GROUP_SLOTS = 6;

export type { SizeBy };

export interface GraphFilters {
  readonly query: string;
  readonly states: readonly TopicState[];
  readonly range: TimeRange;
  readonly showWeak: boolean;
  readonly showOrphans: boolean;
}

/** Topics matching `query` are drawn in group color slot `slot` (first match wins). */
export interface ColorGroup {
  readonly id: string;
  readonly query: string;
  readonly slot: number;
}

export interface GraphDisplay {
  readonly sizeBy: SizeBy;
  readonly nodeScale: number;
  readonly linkScale: number;
  /** Zoom level at which labels fade in (hovered/selected always labelled). */
  readonly textFade: number;
  readonly fadeInactive: boolean;
  readonly stateShapes: boolean;
  readonly colorByState: boolean;
}

export interface GraphForces {
  readonly center: number;
  readonly repel: number;
  readonly link: number;
  readonly distance: number;
}

export interface GraphSettings {
  readonly filters: GraphFilters;
  readonly groups: readonly ColorGroup[];
  readonly display: GraphDisplay;
  readonly forces: GraphForces;
  readonly localDepth: number;
}

export const DEFAULT_SETTINGS: GraphSettings = {
  filters: { query: "", states: ["active", "parked", "done"], range: "all", showWeak: false, showOrphans: true },
  groups: [],
  display: { sizeBy: "alive", nodeScale: 1, linkScale: 1, textFade: 0.7, fadeInactive: true, stateShapes: false, colorByState: false },
  forces: { center: 0.5, repel: 10, link: 1, distance: 120 },
  localDepth: 1,
};

function load(): GraphSettings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const saved = JSON.parse(raw) as Partial<GraphSettings>;
    return {
      filters: { ...DEFAULT_SETTINGS.filters, ...saved.filters },
      groups: Array.isArray(saved.groups) ? saved.groups.filter((g) => typeof g?.query === "string") : [],
      display: { ...DEFAULT_SETTINGS.display, ...saved.display },
      forces: { ...DEFAULT_SETTINGS.forces, ...saved.forces },
      localDepth: typeof saved.localDepth === "number" ? saved.localDepth : DEFAULT_SETTINGS.localDepth,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

interface GraphSettingsState extends GraphSettings {
  setFilters: (patch: Partial<GraphFilters>) => void;
  toggleState: (state: TopicState) => void;
  setDisplay: (patch: Partial<GraphDisplay>) => void;
  setForces: (patch: Partial<GraphForces>) => void;
  addGroup: () => void;
  updateGroup: (id: string, patch: Partial<Omit<ColorGroup, "id">>) => void;
  removeGroup: (id: string) => void;
  setLocalDepth: (depth: number) => void;
  reset: (section: "filters" | "display" | "forces") => void;
}

let groupCounter = 0;

export const useGraphSettings = create<GraphSettingsState>((set) => ({
  ...load(),
  setFilters: (patch) => set((s) => ({ filters: { ...s.filters, ...patch } })),
  toggleState: (state) =>
    set((s) => {
      const has = s.filters.states.includes(state);
      const states = has ? s.filters.states.filter((x) => x !== state) : [...s.filters.states, state];
      return { filters: { ...s.filters, states } };
    }),
  setDisplay: (patch) => set((s) => ({ display: { ...s.display, ...patch } })),
  setForces: (patch) => set((s) => ({ forces: { ...s.forces, ...patch } })),
  addGroup: () =>
    set((s) => ({
      groups: [...s.groups, { id: `g${Date.now().toString(36)}${groupCounter++}`, query: "", slot: s.groups.length % GROUP_SLOTS }],
    })),
  updateGroup: (id, patch) => set((s) => ({ groups: s.groups.map((g) => (g.id === id ? { ...g, ...patch } : g)) })),
  removeGroup: (id) => set((s) => ({ groups: s.groups.filter((g) => g.id !== id) })),
  setLocalDepth: (localDepth) => set({ localDepth }),
  reset: (section) => set({ [section]: DEFAULT_SETTINGS[section] } as Partial<GraphSettings>),
}));

useGraphSettings.subscribe((s) => {
  try {
    const { filters, groups, display, forces, localDepth } = s;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ filters, groups, display, forces, localDepth }));
  } catch {
    // Storage unavailable: settings last for this session only.
  }
});
