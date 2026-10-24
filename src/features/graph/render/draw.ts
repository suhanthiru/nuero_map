//! Canvas painter. Pure drawing from a Scene; no state, no React.

import type { GraphEdge, GraphNode, TopicState } from "../../../api/contract";
import { litAlpha } from "../model/emphasisFade";
import type { NodePaint } from "../model/groups";
import type { LabelBox } from "../model/labelSelection";
import { bucketWidth, drawnRadius, edgeAlphaForZoom, edgeBucket, minEdgeStrength, nodeAlpha } from "../model/scales";
import type { PlacedNode, ViewTransform } from "../model/types";
import type { GraphDisplay } from "../state/graphSettingsStore";
import type { PaintTheme } from "./paintTheme";

export interface Scene {
  readonly nodes: readonly PlacedNode[];
  readonly edges: readonly GraphEdge[];
  readonly byId: ReadonlyMap<string, PlacedNode>;
  readonly t: ViewTransform;
  readonly width: number;
  readonly height: number;
  readonly dpr: number;
  /** The topic whose links light up (hovered, else selected). */
  readonly root: string | null;
  /** Each topic's emphasis right now: 1 lit, 0 dimmed (outside the root's neighbourhood), eased between. */
  readonly level: (id: string) => number;
  readonly hoveredId: string | null;
  readonly focusedId: string | null;
  readonly selectedId: string | null;
  /** The local graph's own topic: always accented. */
  readonly centerId: string | null;
  readonly activeEdgeId: string | null;
  readonly labels: readonly LabelBox[];
  readonly theme: PaintTheme;
  readonly display: GraphDisplay;
  readonly paint: (node: GraphNode) => NodePaint;
}

const DIM = 0.16;
const LABEL_DIM = 0.3;
const RING_PX = 1.5;
const FOCUS_PX = 2.5;
const SEMANTIC_DASH = [4, 5];
const HOT_EDGE_EXTRA_PX = 0.6;
/** Fading links are batched by emphasis level, quantized to this many steps. */
const LEVEL_STEPS = 8;
/** Batch key for the root's own links, which are drawn in the accent. */
const HOT = -1;

function worldTransform(ctx: CanvasRenderingContext2D, s: Scene): void {
  ctx.setTransform(s.dpr * s.t.k, 0, 0, s.dpr * s.t.k, s.dpr * s.t.x, s.dpr * s.t.y);
}

function edgePath(ctx: CanvasRenderingContext2D, a: PlacedNode, b: PlacedNode): void {
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
}

/** HOT for the root's links, else the link's emphasis (its dimmer end) in LEVEL_STEPS steps. */
function edgeStep(e: GraphEdge, s: Scene): number {
  if (s.root && (e.source === s.root || e.target === s.root)) return HOT;
  return Math.round(Math.min(s.level(e.source), s.level(e.target)) * LEVEL_STEPS);
}

function edgeWidth(e: GraphEdge, s: Scene): number {
  return (bucketWidth(edgeBucket(e.strength)) * s.display.linkScale) / s.t.k;
}

function drawEdges(ctx: CanvasRenderingContext2D, s: Scene): void {
  worldTransform(ctx, s);
  // Batch by (kind, width bucket, emphasis step) so a thousand edges are a handful of
  // strokes; once a fade settles there are only two steps again (lit and dimmed).
  const groups = new Map<string, GraphEdge[]>();
  const minStrength = minEdgeStrength(s.t.k);
  for (const e of s.edges) {
    if (e.id === s.activeEdgeId) continue;
    const step = edgeStep(e, s);
    if (e.strength < minStrength && step !== HOT) continue;
    const key = `${e.kind}|${edgeBucket(e.strength)}|${step}`;
    const group = groups.get(key);
    if (group) group.push(e);
    else groups.set(key, [e]);
  }
  const zoomAlpha = edgeAlphaForZoom(s.t.k);
  for (const [key, edges] of groups) {
    const [kind, , stepKey] = key.split("|") as [GraphEdge["kind"], string, string];
    const step = Number(stepKey);
    const hot = step === HOT;
    ctx.beginPath();
    for (const e of edges) {
      const a = s.byId.get(e.source);
      const b = s.byId.get(e.target);
      if (a && b) edgePath(ctx, a, b);
    }
    ctx.globalAlpha = hot ? 0.9 : DIM + (zoomAlpha - DIM) * (step / LEVEL_STEPS);
    ctx.strokeStyle = hot ? s.theme.accent : s.theme.edges[kind];
    ctx.lineWidth = edgeWidth(edges[0], s) + (hot ? HOT_EDGE_EXTRA_PX / s.t.k : 0);
    ctx.setLineDash(kind === "semantic" ? SEMANTIC_DASH.map((d) => d / s.t.k) : []);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
  drawActiveEdge(ctx, s);
}

function drawActiveEdge(ctx: CanvasRenderingContext2D, s: Scene): void {
  const e = s.edges.find((x) => x.id === s.activeEdgeId);
  const a = e && s.byId.get(e.source);
  const b = e && s.byId.get(e.target);
  if (!e || !a || !b) return;
  const base = edgeWidth(e, s);
  ctx.beginPath();
  edgePath(ctx, a, b);
  ctx.strokeStyle = s.theme.halo;
  ctx.lineWidth = base + 5 / s.t.k;
  ctx.stroke();
  ctx.beginPath();
  edgePath(ctx, a, b);
  ctx.strokeStyle = s.theme.accent;
  ctx.lineWidth = base + 1.5 / s.t.k;
  ctx.stroke();
}

function fillFor(n: PlacedNode, s: Scene): string {
  if (n.node.id === s.centerId || n.node.id === s.root) return s.theme.accent;
  const paint = s.paint(n.node);
  if (paint.kind === "group") return s.theme.groups[paint.slot % s.theme.groups.length];
  if (paint.kind === "state") return s.theme.states[paint.state];
  return s.theme.node;
}

/** Rounded square: "done" gets its own silhouette so state never depends on color. */
function squarePath(ctx: CanvasRenderingContext2D, n: PlacedNode, r: number): void {
  const half = r * 0.86;
  ctx.beginPath();
  ctx.roundRect(n.x - half, n.y - half, half * 2, half * 2, half * 0.35);
}

function circlePath(ctx: CanvasRenderingContext2D, n: PlacedNode, r: number): void {
  ctx.beginPath();
  ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
}

function hollow(ctx: CanvasRenderingContext2D, n: PlacedNode, r: number, state: TopicState, color: string, s: Scene): void {
  const px = 1 / s.t.k;
  circlePath(ctx, n, r);
  ctx.fillStyle = s.theme.bg;
  ctx.fill();
  ctx.lineWidth = Math.max(2 * px, r * 0.28);
  ctx.setLineDash(state === "dead" ? [2 * px, 3 * px] : []);
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.setLineDash([]);
}

/** `r` is the drawn radius at the current zoom (see drawnRadius). */
function nodeShape(ctx: CanvasRenderingContext2D, n: PlacedNode, r: number, s: Scene): void {
  const color = fillFor(n, s);
  const state = n.node.state;
  // Shapes carry state whenever color does, so state never depends on hue alone.
  const shaped = s.display.stateShapes || s.display.colorByState;
  if (shaped && (state === "parked" || state === "dead")) {
    hollow(ctx, n, r, state, color, s);
    return;
  }
  if (shaped && state === "done") squarePath(ctx, n, r);
  else circlePath(ctx, n, r);
  ctx.fillStyle = color;
  ctx.fill();
  // Surface ring keeps overlapping nodes separable.
  ctx.lineWidth = RING_PX / s.t.k;
  ctx.strokeStyle = s.theme.nodeRing;
  ctx.stroke();
}

function ring(ctx: CanvasRenderingContext2D, n: PlacedNode, s: Scene, gapPx: number, widthPx: number, color: string, dash: number[] = []): void {
  const px = 1 / s.t.k;
  ctx.beginPath();
  ctx.arc(n.x, n.y, drawnRadius(n.r, s.t.k) + gapPx * px, 0, Math.PI * 2);
  ctx.lineWidth = widthPx * px;
  ctx.strokeStyle = color;
  ctx.setLineDash(dash.map((d) => d * px));
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawNodes(ctx: CanvasRenderingContext2D, s: Scene): void {
  worldTransform(ctx, s);
  // Small first, so big topics sit on top.
  const ordered = [...s.nodes].sort((a, b) => a.r - b.r);
  for (const n of ordered) {
    const level = s.level(n.node.id);
    const fade = s.display.fadeInactive ? nodeAlpha(n.node.decay) : 1;
    ctx.globalAlpha = fade * litAlpha(level, DIM);
    nodeShape(ctx, n, drawnRadius(n.r, s.t.k), s);
    if (n.node.recentlyLinked && level > 0) {
      ctx.globalAlpha = fade * level;
      ring(ctx, n, s, 4, 1.25, s.theme.ink, [2, 2.5]);
    }
  }
  ctx.globalAlpha = 1;
  const selected = s.selectedId ? s.byId.get(s.selectedId) : undefined;
  if (selected) ring(ctx, selected, s, 3.5, FOCUS_PX, s.theme.ink);
  const focused = s.focusedId ? s.byId.get(s.focusedId) : undefined;
  if (focused) ring(ctx, focused, s, 7, FOCUS_PX, s.theme.focus);
}

function drawLabels(ctx: CanvasRenderingContext2D, s: Scene): void {
  ctx.setTransform(s.dpr, 0, 0, s.dpr, 0, 0);
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.lineJoin = "round";
  for (const box of s.labels) {
    const n = s.byId.get(box.id);
    if (!n) continue;
    const strong = box.id === s.selectedId || box.id === s.focusedId || box.id === s.hoveredId || box.id === s.centerId;
    ctx.font = `${strong ? 600 : 500} ${s.theme.labelPx}px ${s.theme.fontFamily}`;
    ctx.globalAlpha = box.alpha * litAlpha(s.level(box.id), LABEL_DIM);
    const cx = box.x + box.width / 2;
    ctx.lineWidth = 4;
    ctx.strokeStyle = s.theme.halo;
    ctx.strokeText(n.node.title, cx, box.y);
    ctx.fillStyle = s.theme.ink;
    ctx.fillText(n.node.title, cx, box.y);
  }
  ctx.globalAlpha = 1;
}

export function drawScene(ctx: CanvasRenderingContext2D, s: Scene): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = s.theme.bg;
  ctx.fillRect(0, 0, s.width * s.dpr, s.height * s.dpr);
  drawEdges(ctx, s);
  drawNodes(ctx, s);
  drawLabels(ctx, s);
}
