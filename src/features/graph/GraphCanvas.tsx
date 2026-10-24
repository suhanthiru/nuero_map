import { forwardRef, useEffect, useId, useImperativeHandle, useMemo, useRef, useState, type FocusEvent, type MouseEvent } from "react";
import { useElementSize } from "../../shared/hooks/useElementSize";
import { useReducedMotion } from "../../shared/hooks/useReducedMotion";
import { EdgeTooltip, NodeTooltip } from "./NodeTooltip";
import { useCanvasPointer } from "./interaction/useCanvasPointer";
import { graphKeyHandler } from "./interaction/useGraphKeys";
import { useZoom, type PanGate } from "./interaction/useZoom";
import { useForceLayout } from "./layout/useForceLayout";
import { describeNode } from "./model/describe";
import { neighbours } from "./model/filterGraph";
import { boundsOf, fitTransform, toScreen } from "./model/geometry";
import { paintFor } from "./model/groups";
import { buildHitIndex } from "./model/hitTest";
import { mostImportant } from "./model/keyboardNav";
import { labelFadeZoom, selectLabels } from "./model/labelSelection";
import type { Hit, PlacedNode, VisibleGraph } from "./model/types";
import { drawScene } from "./render/draw";
import { usePaintTheme } from "./render/paintTheme";
import { useEmphasisFade } from "./render/useEmphasisFade";
import { useMeasure } from "./render/useMeasure";
import { useGraphSettings } from "./state/graphSettingsStore";
import s from "./Graph.module.css";

export interface GraphCanvasHandle {
  fit: () => void;
  centerOn: (id: string) => void;
  zoomIn: () => void;
  zoomOut: () => void;
}

type OpenEvent = Pick<MouseEvent, "ctrlKey" | "metaKey" | "button">;

interface Props {
  readonly graph: VisibleGraph;
  /** Opens a topic; the event decides "new tab" (Ctrl/Cmd or middle-click). */
  readonly onOpenTopic: (id: string, e?: OpenEvent) => void;
  /** Separate position memory per graph instance ("global", "local"). */
  readonly namespace?: string;
  /** Changing this re-fits the view (e.g. the local graph moved to another topic). */
  readonly fitKey?: string;
  /** The local graph's own topic. */
  readonly centerId?: string | null;
  /** Time-lapse: only these topics are drawn (null = all). */
  readonly revealed?: ReadonlySet<string> | null;
  readonly selectedId?: string | null;
  readonly selectedEdgeId?: string | null;
  /** Without these, a click opens the topic straight away (local graph). */
  readonly onSelectNode?: (id: string) => void;
  readonly onSelectEdge?: (id: string) => void;
  readonly onClear?: () => void;
  readonly label?: string;
}

const VISIBLE_INSET = 60;
const LINE_HEIGHT_EM = 1.3;

/** Spoken description of the map's keyboard and mouse model (the legend shows it visibly). */
export const GRAPH_KEYS_HELP =
  "Drag topics to move them · Click previews · Double-click or Ctrl+click opens · Arrows move · Enter selects, again opens · [ ] by importance · + − 0 zoom · Esc clears";

/** Keyboard focus only: a mouse press also focuses the map but shouldn't start keyboard mode. */
function isKeyboardFocus(e: FocusEvent<HTMLElement>): boolean {
  try {
    return e.currentTarget.matches(":focus-visible");
  } catch {
    return true; // selector unsupported (old engines, test DOMs): assume keyboard
  }
}

function emphasisFor(id: string | null, edgeEnds: readonly string[] | null, adj: ReadonlyMap<string, ReadonlySet<string>>): ReadonlySet<string> | null {
  if (edgeEnds) return new Set(edgeEnds);
  if (!id) return null;
  return new Set([id, ...(adj.get(id) ?? [])]);
}

function wantsNewTab(e: OpenEvent): boolean {
  return e.ctrlKey || e.metaKey || e.button === 1;
}

export const GraphCanvas = forwardRef<GraphCanvasHandle, Props>(function GraphCanvas(props, ref) {
  const { graph, onOpenTopic, namespace = "global", fitKey = namespace, centerId = null, revealed = null } = props;
  const { selectedId = null, selectedEdgeId = null, onSelectNode, onSelectEdge, onClear, label = "Topic map" } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const panGate = useRef<PanGate>(() => true);
  const size = useElementSize(containerRef);
  const theme = usePaintTheme();
  const reduced = useReducedMotion();
  const { display, groups, forces } = useGraphSettings();
  const zoom = useZoom(canvasRef, reduced, panGate);
  const { placed, ready, drag } = useForceLayout(graph, { forces, sizeBy: display.sizeBy, nodeScale: display.nodeScale, reducedMotion: reduced, namespace });
  const helpId = useId();
  const measure = useMeasure(theme);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [keyboardActive, setKeyboardActive] = useState(false);

  const drawn = useMemo(() => (revealed ? placed.filter((n) => revealed.has(n.node.id)) : placed), [placed, revealed]);
  const edges = useMemo(() => (revealed ? graph.edges.filter((e) => revealed.has(e.source) && revealed.has(e.target)) : graph.edges), [graph.edges, revealed]);
  const byId = useMemo(() => new Map(drawn.map((n) => [n.node.id, n])), [drawn]);
  const index = useMemo(() => buildHitIndex(drawn, edges), [drawn, edges]);
  const adj = useMemo(() => neighbours({ nodes: graph.nodes, edges }), [graph.nodes, edges]);
  const paint = useMemo(() => (n: PlacedNode["node"]) => paintFor(n, groups, display), [groups, display]);

  const fit = (animate = true) => zoom.apply(fitTransform(boundsOf(drawn.length ? drawn : placed), size.width, size.height), animate);
  const centerOn = (id: string) => {
    const n = byId.get(id);
    if (!n) return;
    const k = Math.max(zoom.t.k, 1);
    zoom.apply({ k, x: size.width / 2 - n.x * k, y: size.height / 2 - n.y * k });
  };
  useImperativeHandle(ref, () => ({ fit: () => fit(), centerOn, zoomIn: zoom.stepIn, zoomOut: zoom.stepOut }));

  const select = (hit: Hit, e: MouseEvent) => {
    setKeyboardActive(false);
    if (hit.kind === "node") {
      setFocusedId(hit.id);
      if (wantsNewTab(e) || !onSelectNode) onOpenTopic(hit.id, e);
      else onSelectNode(hit.id);
    } else if (hit.kind === "edge" && e.button === 0) onSelectEdge?.(hit.id);
    else if (hit.kind === "none" && e.button === 0) onClear?.();
  };
  const pointer = useCanvasPointer({
    index, t: zoom.t, drag, panGate,
    onClick: select,
    onDoubleClick: (hit, e) => {
      if (hit.kind === "node" && onSelectNode) onOpenTopic(hit.id, e);
    },
  });
  const { hover } = pointer;
  const hoveredId = hover.hit.kind === "node" ? hover.hit.id : null;
  const hoveredEdgeId = hover.hit.kind === "edge" ? hover.hit.id : null;
  const activeEdge = edges.find((e) => e.id === (selectedEdgeId ?? hoveredEdgeId));
  const hoveredEdge = hoveredEdgeId ? edges.find((e) => e.id === hoveredEdgeId) : undefined;
  const root = hoveredId ?? selectedId;
  const emphasis = useMemo(
    () => emphasisFor(root, activeEdge ? [activeEdge.source, activeEdge.target] : null, adj),
    [root, activeEdge, adj],
  );
  // The latest painter, so the fade can repaint every frame without re-rendering React.
  const paintRef = useRef<() => void>(() => undefined);
  const levels = useEmphasisFade(emphasis, reduced, () => drawn.map((n) => n.node.id), () => paintRef.current());

  // Fit once the first layout lands, and again whenever the fit key changes, but only to
  // positions computed for the current graph (not the previous one still on screen).
  const fittedKey = useRef<string | null>(null);
  useEffect(() => {
    if (fittedKey.current !== fitKey && ready && placed.length > 0 && size.width > 0) {
      fittedKey.current = fitKey;
      fit(false);
    }
  });

  // When the stage resizes (side panel opens/closes), keep the same world point centred.
  // A hidden tab measures 0×0; ignore that so switching tabs doesn't move the view.
  const lastSize = useRef(size);
  useEffect(() => {
    if (size.width === 0 || size.height === 0) return;
    const prev = lastSize.current;
    lastSize.current = size;
    if (prev.width === 0 || (prev.width === size.width && prev.height === size.height)) return;
    zoom.apply({ k: zoom.t.k, x: zoom.t.x + (size.width - prev.width) / 2, y: zoom.t.y + (size.height - prev.height) / 2 }, false);
  }, [size]);

  // A selected (or keyboard-focused) topic that ends up off screen is brought into view.
  const keepVisible = (id: string | null) => {
    const n = id ? byId.get(id) : undefined;
    if (!n || size.width === 0) return;
    const p = toScreen(n, zoom.t);
    const off = p.x < VISIBLE_INSET || p.y < VISIBLE_INSET || p.x > size.width - VISIBLE_INSET || p.y > size.height - VISIBLE_INSET;
    if (off) centerOn(n.node.id);
  };
  useEffect(() => keepVisible(selectedId), [selectedId, size.width, byId.size > 0]);
  useEffect(() => {
    if (keyboardActive) keepVisible(focusedId);
  }, [focusedId, keyboardActive]);

  const pinned = useMemo(
    () => new Set([...(emphasis ?? []), ...(focusedId ? [focusedId] : []), ...(centerId ? [centerId] : [])]),
    [emphasis, focusedId, centerId],
  );
  const fadeK = labelFadeZoom(display.textFade);
  const labels = useMemo(
    () => selectLabels(drawn, zoom.t, size, pinned, measure, theme.labelPx * LINE_HEIGHT_EM, fadeK),
    [drawn, zoom.t, size, pinned, measure, theme.labelPx, fadeK],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || size.width === 0) return;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(size.width * dpr)) canvas.width = Math.round(size.width * dpr);
    if (canvas.height !== Math.round(size.height * dpr)) canvas.height = Math.round(size.height * dpr);
    const paintNow = () =>
      drawScene(ctx, {
        nodes: drawn, edges, byId, t: zoom.t, width: size.width, height: size.height, dpr,
        root, level: levels(), hoveredId, focusedId: keyboardActive ? focusedId : null, selectedId, centerId,
        activeEdgeId: activeEdge?.id ?? null, labels, theme, display, paint,
      });
    paintRef.current = paintNow;
    const id = requestAnimationFrame(paintNow);
    return () => cancelAnimationFrame(id);
    // `emphasis` repaints when the fade switches instantly (reduced motion).
  }, [drawn, edges, byId, zoom.t, size, root, emphasis, levels, hoveredId, focusedId, keyboardActive, selectedId, centerId, activeEdge, labels, theme, display, paint]);

  const onKeyDown = graphKeyHandler({
    nodes: drawn, focusedId, selectedId,
    setFocus: (id) => {
      setKeyboardActive(true);
      setFocusedId(id);
    },
    select: (id) => (onSelectNode ? onSelectNode(id) : onOpenTopic(id)),
    open: (id) => onOpenTopic(id),
    clear: () => onClear?.(),
    zoomIn: zoom.stepIn,
    zoomOut: zoom.stepOut,
    fit: () => fit(),
  });

  const focusedNode = focusedId ? byId.get(focusedId) : undefined;
  const hoveredNode = hoveredId && !pointer.isDragging ? byId.get(hoveredId) : undefined;
  const tooltipNode = hoveredNode ?? (keyboardActive ? focusedNode : undefined);
  const tooltipAt = hoveredNode ? { x: hover.x, y: hover.y } : focusedNode ? toScreen(focusedNode, zoom.t) : null;
  const edgeEnds = hoveredEdge ? [byId.get(hoveredEdge.source), byId.get(hoveredEdge.target)] : null;
  const announcement = focusedNode && keyboardActive ? describeNode(focusedNode.node, adj.get(focusedNode.node.id)?.size ?? 0) : "";
  const cursor = pointer.isDragging ? "grabbing" : hover.hit.kind === "none" ? "default" : "pointer";

  return (
    <div
      ref={containerRef}
      className={s.canvasWrap}
      tabIndex={0}
      role="application"
      aria-roledescription="topic map"
      aria-label={`${label} with ${drawn.length} topics and ${edges.length} connections`}
      aria-describedby={helpId}
      onKeyDown={onKeyDown}
      onFocus={(e) => {
        if (e.target !== e.currentTarget || !isKeyboardFocus(e)) return;
        if (!focusedId) setFocusedId(centerId ?? mostImportant(drawn));
        setKeyboardActive(true);
      }}
      onBlur={() => setKeyboardActive(false)}
    >
      <canvas
        ref={canvasRef}
        className={s.canvas}
        // Sized in px to match the pixel buffer, so a resize clips for a frame instead of stretching.
        style={{ width: size.width, height: size.height, cursor }}
        aria-hidden
        {...pointer.handlers}
        onMouseLeave={pointer.clearHover}
      />
      {tooltipNode && tooltipAt && (
        <NodeTooltip node={tooltipNode.node} at={tooltipAt} viewport={size} connections={adj.get(tooltipNode.node.id)?.size ?? 0} />
      )}
      {hoveredEdge && edgeEnds?.[0] && edgeEnds[1] && (
        <EdgeTooltip edge={hoveredEdge} a={edgeEnds[0].node.title} b={edgeEnds[1].node.title} at={{ x: hover.x, y: hover.y }} viewport={size} />
      )}
      <p id={helpId} className="visually-hidden">
        {GRAPH_KEYS_HELP}
      </p>
      <p className="visually-hidden" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
});
