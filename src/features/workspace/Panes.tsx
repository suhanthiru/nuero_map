import { Fragment, useRef, type KeyboardEvent, type PointerEvent, type RefObject } from "react";
import { MIN_PANE_SIZE, type Pane as PaneModel } from "./model/panes";
import { TabBar } from "./TabBar";
import { ViewHeader } from "./ViewHeader";
import { ViewHost } from "./ViewHost";
import { useWorkspace } from "./workspaceStore";
import s from "./Workspace.module.css";

const KEY_STEP = 0.02;
const KEY_STEP_BIG = 0.1;

interface PaneProps {
  readonly pane: PaneModel;
  readonly index: number;
  readonly count: number;
  readonly focused: boolean;
}

function Pane({ pane, index, count, focused }: PaneProps) {
  const focusPane = useWorkspace((st) => st.focusPane);
  const claim = () => {
    if (!focused) focusPane(pane.id);
  };
  return (
    <section
      className={s.editorPane}
      style={{ flex: `${pane.size} 1 0` }}
      data-focused={focused}
      aria-label={count > 1 ? `Pane ${index + 1} of ${count}` : undefined}
      onPointerDownCapture={claim}
      onFocusCapture={claim}
    >
      <TabBar pane={pane} isLast={index === count - 1} focused={focused} />
      <ViewHeader pane={pane} />
      <ViewHost pane={pane} focused={focused} />
    </section>
  );
}

interface DividerProps {
  readonly index: number;
  readonly left: PaneModel;
  readonly right: PaneModel;
  /** Share of the row taken by the panes before `left`. */
  readonly offset: number;
  readonly row: RefObject<HTMLDivElement | null>;
}

/** Drag, or focus and use ←/→ (Shift for bigger steps, Home/End for the limits), to resize. */
function Divider({ index, left, right, offset, row }: DividerProps) {
  const resize = useWorkspace((st) => st.resizePane);
  const pair = left.size + right.size;
  const percent = Math.round((left.size / pair) * 100);
  const minPercent = Math.round((MIN_PANE_SIZE / pair) * 100);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    // Pointer moves come faster than frames; resize (and re-render the panes) once per frame.
    let frame = 0;
    let lastX = e.clientX;
    const apply = () => {
      frame = 0;
      const rect = row.current?.getBoundingClientRect();
      if (!rect || rect.width === 0) return;
      resize(index, (lastX - rect.left) / rect.width - offset);
    };
    const move = (ev: globalThis.PointerEvent) => {
      lastX = ev.clientX;
      if (!frame) frame = requestAnimationFrame(apply);
    };
    const up = () => {
      // Land exactly where the pointer was let go.
      if (frame) {
        cancelAnimationFrame(frame);
        apply();
      }
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    e.preventDefault();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    // Alt+←/→ is Back/Forward, Ctrl+… are global commands: leave them alone.
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const step = e.shiftKey ? KEY_STEP_BIG : KEY_STEP;
    if (e.key === "ArrowLeft") resize(index, left.size - step);
    else if (e.key === "ArrowRight") resize(index, left.size + step);
    else if (e.key === "Home") resize(index, MIN_PANE_SIZE);
    else if (e.key === "End") resize(index, pair - MIN_PANE_SIZE);
    else return;
    e.preventDefault();
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={`Resize pane ${index + 1} and pane ${index + 2}`}
      aria-valuenow={percent}
      aria-valuemin={minPercent}
      aria-valuemax={100 - minPercent}
      tabIndex={0}
      className={s.divider}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
    />
  );
}

/** The editor area: panes side by side, each with its own tabs, split by draggable dividers. */
export function Panes() {
  const layout = useWorkspace((st) => st.layout);
  const row = useRef<HTMLDivElement>(null);
  const { panes } = layout;
  return (
    <div ref={row} className={s.panes}>
      {panes.map((pane, i) => {
        const offset = panes.slice(0, i).reduce((n, p) => n + p.size, 0);
        // Keyed per pane, so splitting or closing one never remounts the others (graph layout, scroll).
        return (
          <Fragment key={pane.id}>
            {i > 0 && <Divider index={i - 1} left={panes[i - 1]} right={pane} offset={offset - panes[i - 1].size} row={row} />}
            <Pane pane={pane} index={i} count={panes.length} focused={pane.id === layout.activePaneId} />
          </Fragment>
        );
      })}
    </div>
  );
}
