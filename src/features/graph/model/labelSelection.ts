import { drawnRadius, importance } from "./scales";
import type { PlacedNode, ViewTransform } from "./types";

export const LABEL_BUDGET_BASE = 40;
export const LABEL_BUDGET_MIN = 20;
const LABEL_GAP_PX = 6;
const LABEL_PAD_PX = 3;
/** Labels beyond the budget start fading in at this fraction of the fade zoom. */
const FADE_START = 0.7;
const FADE_K_MIN = 0.4;
const FADE_K_SPAN = 2;

export interface LabelBox {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** 0..1: labels past the budget fade in as you zoom. */
  readonly alpha: number;
}

/** More labels as you zoom in. */
export function labelBudget(k: number, nodeCount: number): number {
  return Math.min(nodeCount, Math.max(LABEL_BUDGET_MIN, Math.round(LABEL_BUDGET_BASE * Math.pow(k, 1.5))));
}

/** The "text fade threshold" setting (0..1) as the zoom at which every label is fully shown. */
export function labelFadeZoom(textFade: number): number {
  return FADE_K_MIN + FADE_K_SPAN * Math.min(1, Math.max(0, textFade));
}

/** Opacity of the labels past the budget at zoom k. */
export function extraLabelAlpha(k: number, fadeK: number): number {
  if (!Number.isFinite(fadeK)) return 0;
  const start = fadeK * FADE_START;
  return Math.min(1, Math.max(0, (k - start) / (fadeK - start)));
}

function overlaps(a: LabelBox, b: LabelBox): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/**
 * Picks which nodes get labels: always the `pinned` ones (focused, hovered, selected,
 * their neighbours), then the most important up to the zoom budget, then (past the fade
 * zoom) the rest at reduced opacity, skipping any label that would collide. Labels sit
 * below their node in screen space. `measure` returns text width in px.
 */
export function selectLabels(
  nodes: readonly PlacedNode[],
  t: ViewTransform,
  viewport: { width: number; height: number },
  pinned: ReadonlySet<string>,
  measure: (text: string) => number,
  lineHeight: number,
  fadeK: number = Infinity,
): LabelBox[] {
  const budget = labelBudget(t.k, nodes.length);
  const extra = extraLabelAlpha(t.k, fadeK);
  const ordered = [...nodes].sort((a, b) => {
    const pa = pinned.has(a.node.id) ? 1 : 0;
    const pb = pinned.has(b.node.id) ? 1 : 0;
    return pb - pa || importance(b.node) - importance(a.node);
  });
  const placed: LabelBox[] = [];
  for (const n of ordered) {
    const isPinned = pinned.has(n.node.id);
    const withinBudget = placed.length < budget;
    if (!isPinned && !withinBudget && extra === 0) break;
    const width = measure(n.node.title) + LABEL_PAD_PX * 2;
    const sx = n.x * t.k + t.x;
    const sy = n.y * t.k + t.y;
    const alpha = isPinned || withinBudget ? 1 : extra;
    const rPx = drawnRadius(n.r, t.k) * t.k;
    const box: LabelBox = { id: n.node.id, x: sx - width / 2, y: sy + rPx + LABEL_GAP_PX, width, height: lineHeight, alpha };
    const onScreen = box.x + box.width > 0 && box.x < viewport.width && box.y < viewport.height && sy > -rPx;
    if (!onScreen) continue;
    if (isPinned || !placed.some((p) => overlaps(p, box))) placed.push(box);
  }
  return placed;
}
