import { useEffect, useRef, useState, type MouseEvent, type PointerEvent, type RefObject } from "react";
import type { DragApi } from "../layout/useForceLayout";
import { toWorld } from "../model/geometry";
import { hitTest, type HitIndex } from "../model/hitTest";
import type { Hit, Point, ViewTransform } from "../model/types";
import type { PanGate } from "./useZoom";

export interface HoverState {
  readonly hit: Hit;
  readonly x: number;
  readonly y: number;
}

export const NO_HOVER: HoverState = { hit: { kind: "none" }, x: 0, y: 0 };
const DRAG_THRESHOLD_PX = 4;

interface Options {
  readonly index: HitIndex;
  readonly t: ViewTransform;
  readonly drag: DragApi;
  readonly panGate: RefObject<PanGate>;
  onClick: (hit: Hit, e: MouseEvent) => void;
  onDoubleClick: (hit: Hit, e: MouseEvent) => void;
}

interface DragState {
  readonly id: string;
  readonly x0: number;
  readonly y0: number;
  moved: boolean;
}

function localPoint(e: { clientX: number; clientY: number }, el: Element): Point {
  const rect = el.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

/**
 * Pointer handling for the map: hover, click, double-click, middle-click, and dragging
 * a topic (which wins over panning, via the zoom pan gate).
 */
export function useCanvasPointer(opts: Options) {
  const { index, t, drag, panGate } = opts;
  const [hover, setHover] = useState<HoverState>(NO_HOVER);
  const [isDragging, setIsDragging] = useState(false);
  const dragging = useRef<DragState | null>(null);
  const justDragged = useRef(false);

  const hitAt = (p: Point): Hit => hitTest(index, toWorld(p, t), t.k);

  // The zoom behaviour is created once, so it reads the latest hit index through the gate.
  // A press (mouse or touch) on a topic drags the topic instead of panning the map.
  useEffect(() => {
    panGate.current = (event) => {
      const point = "touches" in event ? event.touches[0] : event;
      if (!point || !(event.target instanceof Element)) return true;
      return hitTest(index, toWorld(localPoint(point, event.target), t), t.k).kind !== "node";
    };
  }, [index, t, panGate]);

  const onPointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0 || e.ctrlKey || e.metaKey) return;
    const hit = hitAt(localPoint(e, e.currentTarget));
    if (hit.kind !== "node") return;
    dragging.current = { id: hit.id, x0: e.clientX, y0: e.clientY, moved: false };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    const p = localPoint(e, e.currentTarget);
    const d = dragging.current;
    if (!d) {
      setHover({ hit: hitAt(p), x: p.x, y: p.y });
      return;
    }
    if (!d.moved && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < DRAG_THRESHOLD_PX) return;
    if (!d.moved) {
      d.moved = true;
      drag.start(d.id);
      setIsDragging(true);
    }
    const w = toWorld(p, t);
    drag.move(d.id, w.x, w.y);
    setHover({ hit: { kind: "node", id: d.id }, x: p.x, y: p.y });
  };

  const finishDrag = (e: PointerEvent<HTMLCanvasElement>, cancelled: boolean) => {
    const d = dragging.current;
    dragging.current = null;
    if (!d) return;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    if (!d.moved) return;
    drag.end(d.id);
    setIsDragging(false);
    // A completed drag is followed by a click to swallow; a cancelled one is not.
    justDragged.current = !cancelled;
  };
  const onPointerUp = (e: PointerEvent<HTMLCanvasElement>) => finishDrag(e, false);
  const onPointerCancel = (e: PointerEvent<HTMLCanvasElement>) => finishDrag(e, true);

  const onClick = (e: MouseEvent<HTMLCanvasElement>) => {
    if (justDragged.current) {
      justDragged.current = false;
      return;
    }
    opts.onClick(hitAt(localPoint(e, e.currentTarget)), e);
  };

  const onDoubleClick = (e: MouseEvent<HTMLCanvasElement>) => opts.onDoubleClick(hitAt(localPoint(e, e.currentTarget)), e);

  // Middle-click: same as Ctrl+click (open in a new tab).
  const onAuxClick = (e: MouseEvent<HTMLCanvasElement>) => {
    if (e.button === 1) opts.onClick(hitAt(localPoint(e, e.currentTarget)), e);
  };

  const onMouseDown = (e: MouseEvent<HTMLCanvasElement>) => {
    // Stops the browser's autoscroll cursor on middle-click.
    if (e.button === 1) e.preventDefault();
  };

  return {
    hover,
    isDragging,
    clearHover: () => setHover(NO_HOVER),
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onClick, onDoubleClick, onAuxClick, onMouseDown },
  };
}
