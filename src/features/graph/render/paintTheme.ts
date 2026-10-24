import { useEffect, useState } from "react";
import type { EdgeKind, TopicState } from "../../../api/contract";
import { GROUP_SLOTS } from "../state/graphSettingsStore";

/** Canvas colors and type, read from the same CSS tokens as the rest of the UI. */
export interface PaintTheme {
  readonly bg: string;
  readonly ink: string;
  readonly muted: string;
  readonly halo: string;
  readonly nodeRing: string;
  /** Default node fill when no group or state coloring applies. */
  readonly node: string;
  /** Hover / selection highlight. */
  readonly accent: string;
  readonly focus: string;
  readonly states: Readonly<Record<TopicState, string>>;
  readonly groups: readonly string[];
  readonly edges: Readonly<Record<EdgeKind, string>>;
  readonly fontFamily: string;
  /** Label size in CSS px (follows the text-size setting). */
  readonly labelPx: number;
}

const STATES: readonly TopicState[] = ["active", "parked", "done", "dead"];
const LABEL_EM = 0.78;

function readTheme(): PaintTheme {
  const root = document.documentElement;
  const css = getComputedStyle(root);
  const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  const rootPx = parseFloat(css.fontSize) || 16;
  return {
    bg: v("--graph-bg", "#1e1e1e"),
    ink: v("--graph-label", "#dadada"),
    muted: v("--muted", "#999999"),
    halo: v("--graph-label-halo", "#1e1e1e"),
    nodeRing: v("--graph-node-stroke", "#1e1e1e"),
    node: v("--graph-node", "#a3a3a3"),
    accent: v("--accent", "#8b6cef"),
    focus: v("--focus", "#a68af9"),
    states: Object.fromEntries(STATES.map((s) => [s, v(`--state-${s}`, "#888")])) as Record<TopicState, string>,
    groups: Array.from({ length: GROUP_SLOTS }, (_, i) => v(`--group-${i + 1}`, "#888")),
    edges: {
      explicit: v("--graph-edge-explicit", "rgba(220,220,220,.34)"),
      note: v("--graph-edge-note", "rgba(63,191,160,.6)"),
      cooccurrence: v("--graph-edge-cooc", "rgba(170,170,170,.24)"),
      semantic: v("--graph-edge-semantic", "rgba(150,150,150,.16)"),
    },
    fontFamily: v("--font-ui", "sans-serif"),
    labelPx: Math.round(rootPx * LABEL_EM * 10) / 10,
  };
}

/** Re-reads the palette whenever the theme or text size changes. */
export function usePaintTheme(): PaintTheme {
  const [theme, setTheme] = useState<PaintTheme>(readTheme);
  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(readTheme()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-text-size", "data-accent"] });
    // "system" theme follows the OS without touching data-theme.
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    const onMedia = () => setTheme(readTheme());
    media?.addEventListener?.("change", onMedia);
    // Fonts may finish loading after first paint; re-measure once they do.
    document.fonts?.ready.then(() => setTheme(readTheme())).catch(() => undefined);
    return () => {
      observer.disconnect();
      media?.removeEventListener?.("change", onMedia);
    };
  }, []);
  return theme;
}
