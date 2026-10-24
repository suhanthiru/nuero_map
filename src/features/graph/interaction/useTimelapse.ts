import { useCallback, useEffect, useMemo, useState } from "react";
import type { GraphNode } from "../../../api/contract";
import { byCreation, revealedCount, timeAt, timeSpan, type TimeSpan } from "../model/timelapse";

const DURATION_MS = 8000;
/** With reduced motion the replay advances in discrete steps instead of continuously. */
const REDUCED_STEPS = 12;
const REDUCED_STEP_MS = 700;

export type TimelapsePhase = "idle" | "playing" | "finished";

export interface Timelapse {
  readonly phase: TimelapsePhase;
  readonly playing: boolean;
  /** Topics shown at the current moment, or null when not playing. Same Set until one appears. */
  readonly revealed: ReadonlySet<string> | null;
  /** The moment being shown (epoch ms), or null when not playing. */
  readonly at: number | null;
  readonly span: TimeSpan | null;
  readonly toggle: () => void;
  readonly stop: () => void;
}

/** Replays the map growing: topics appear in the order you first talked about them. */
export function useTimelapse(nodes: readonly GraphNode[], reducedMotion: boolean, enabled = true): Timelapse {
  const [progress, setProgress] = useState<number | null>(null);
  const [phase, setPhase] = useState<TimelapsePhase>("idle");
  const span = useMemo(() => timeSpan(nodes), [nodes]);
  const ordered = useMemo(() => byCreation(nodes), [nodes]);
  const playing = progress !== null;

  const finish = useCallback(() => {
    setProgress(null);
    setPhase((p) => (p === "playing" ? "finished" : p));
  }, []);

  useEffect(() => {
    if (!playing) return;
    if (reducedMotion) {
      let step = 0;
      const timer = window.setInterval(() => {
        step += 1;
        if (step >= REDUCED_STEPS) finish();
        else setProgress(step / REDUCED_STEPS);
      }, REDUCED_STEP_MS);
      return () => window.clearInterval(timer);
    }
    const started = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const p = (now - started) / DURATION_MS;
      if (p >= 1) {
        finish();
        return;
      }
      setProgress(p);
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [playing, reducedMotion, finish]);

  // Leaving the tab (or losing the data) ends the replay.
  useEffect(() => {
    if (!enabled || !span) finish();
  }, [enabled, span, finish]);

  const toggle = useCallback(() => {
    if (progress !== null || !span) {
      finish();
      return;
    }
    setPhase("playing");
    setProgress(0);
  }, [progress, span, finish]);

  const at = progress !== null && span ? timeAt(span, progress) : null;
  // Topics only ever appear, in creation order, so the shown set is a prefix of `ordered`:
  // keyed on its length, it stays the same object between appearances (no per-frame rebuild).
  const count = at !== null ? revealedCount(ordered, at) : null;
  const revealed = useMemo(() => (count !== null ? new Set(ordered.slice(0, count).map((n) => n.id)) : null), [ordered, count]);
  return { phase, playing, revealed, at, span, toggle, stop: finish };
}
