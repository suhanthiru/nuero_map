import { useCallback, useEffect, useRef } from "react";
import { FADE_MS, fadeDone, levelAt, startFade, type Fade } from "../model/emphasisFade";

/**
 * Eases topics into and out of emphasis when the hovered or selected topic changes.
 * Returns a reader that samples every topic's level (0 dimmed … 1 lit) at this moment;
 * while a fade runs, `repaint` is called once per animation frame. Reduced motion
 * switches at once and never animates.
 */
export function useEmphasisFade(
  emphasis: ReadonlySet<string> | null,
  reduced: boolean,
  allIds: () => readonly string[],
  repaint: () => void,
): () => (id: string) => number {
  const fade = useRef<Fade | null>(null);
  const frame = useRef<number | null>(null);
  const latest = useRef({ allIds, repaint });
  // Declared before the fade effect, so that effect always sees this render's callbacks.
  useEffect(() => {
    latest.current = { allIds, repaint };
  });

  useEffect(() => {
    if (fade.current === null && emphasis === null) return; // everything is already lit
    const now = performance.now();
    const next = startFade(fade.current, latest.current.allIds(), emphasis, now, reduced ? 0 : FADE_MS);
    fade.current = next;
    // A running loop picks up the new fade. Otherwise start one, even for the same fade:
    // StrictMode's remount (and Fast Refresh) cancel the loop of a fade still under way.
    if (frame.current !== null || fadeDone(next, now)) return;
    const step = () => {
      const f = fade.current;
      // Decide before painting, so the last frame paints the settled levels exactly.
      const finished = f === null || fadeDone(f, performance.now());
      latest.current.repaint();
      frame.current = finished ? null : requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
  }, [emphasis, reduced]);

  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
    },
    [],
  );

  return useCallback(() => {
    const f = fade.current;
    const now = performance.now();
    return (id: string) => levelAt(f, id, now);
  }, []);
}
