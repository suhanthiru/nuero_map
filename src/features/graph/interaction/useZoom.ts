import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { select } from "d3-selection";
import "d3-transition";
import { zoom, zoomIdentity, type ZoomBehavior } from "d3-zoom";
import type { ViewTransform } from "../model/types";

export const ZOOM_EXTENT: readonly [number, number] = [0.08, 8];
const ZOOM_STEP = 1.4;
const ANIMATE_MS = 420;

export interface ZoomControls {
  readonly t: ViewTransform;
  /** True once the user has panned or zoomed themselves. */
  readonly touched: boolean;
  apply: (t: ViewTransform, animate?: boolean) => void;
  zoomBy: (factor: number) => void;
  stepIn: () => void;
  stepOut: () => void;
}

/** Decides whether a press may start a pan (false when it lands on a draggable topic). */
export type PanGate = (event: MouseEvent | TouchEvent | WheelEvent) => boolean;

/**
 * d3-zoom on the canvas: wheel and drag to pan/zoom, double-click reserved for opening.
 * `panGate` lets node dragging take precedence over panning.
 */
export function useZoom(canvasRef: RefObject<HTMLCanvasElement | null>, reducedMotion: boolean, panGate?: RefObject<PanGate>): ZoomControls {
  const [t, setT] = useState<ViewTransform>({ k: 1, x: 0, y: 0 });
  const [touched, setTouched] = useState(false);
  const behavior = useRef<ZoomBehavior<HTMLCanvasElement, unknown> | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const z = zoom<HTMLCanvasElement, unknown>()
      .scaleExtent([...ZOOM_EXTENT])
      .clickDistance(4)
      .filter((event: MouseEvent | TouchEvent | WheelEvent) => {
        const isWheel = event.type === "wheel";
        const plain = (!event.ctrlKey || isWheel) && !("button" in event && event.button);
        if (!plain) return false;
        return isWheel || !panGate?.current || panGate.current(event);
      })
      .on("zoom", (event) => {
        const { k, x, y } = event.transform;
        setT({ k, x, y });
        if (event.sourceEvent) setTouched(true);
      });
    const sel = select(canvas);
    sel.call(z).on("dblclick.zoom", null);
    behavior.current = z;
    return () => {
      sel.on(".zoom", null);
    };
  }, [canvasRef, panGate]);

  const apply = useCallback(
    (next: ViewTransform, animate = true) => {
      const canvas = canvasRef.current;
      const z = behavior.current;
      if (!canvas || !z) return;
      const target = zoomIdentity.translate(next.x, next.y).scale(next.k);
      const sel = select(canvas);
      if (animate && !reducedMotion) sel.transition().duration(ANIMATE_MS).call(z.transform, target);
      else sel.call(z.transform, target);
    },
    [canvasRef, reducedMotion],
  );

  const zoomBy = useCallback(
    (factor: number) => {
      const canvas = canvasRef.current;
      const z = behavior.current;
      if (!canvas || !z) return;
      const sel = select(canvas);
      if (reducedMotion) sel.call(z.scaleBy, factor);
      else sel.transition().duration(ANIMATE_MS / 2).call(z.scaleBy, factor);
    },
    [canvasRef, reducedMotion],
  );

  return {
    t,
    touched,
    apply,
    zoomBy,
    stepIn: () => zoomBy(ZOOM_STEP),
    stepOut: () => zoomBy(1 / ZOOM_STEP),
  };
}
