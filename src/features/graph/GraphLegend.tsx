import { useState } from "react";
import { TOPIC_STATES } from "../../api/contract";
import { STATE_LABEL, StateGlyph } from "../../shared/ui/StateGlyph";
import { GRAPH_KEYS_HELP } from "./GraphCanvas";
import { SLOT_NAMES } from "./controls/GraphControls";
import type { SizeBy } from "./model/scales";
import { useGraphSettings } from "./state/graphSettingsStore";
import s from "./Graph.module.css";

function EdgeSample({ dashed, width, color }: { readonly dashed?: boolean; readonly width: number; readonly color: string }) {
  return (
    <svg width="28" height="10" aria-hidden>
      <line x1="1" y1="5" x2="27" y2="5" stroke={color} strokeWidth={width} strokeDasharray={dashed ? "3 3" : undefined} />
    </svg>
  );
}

function Dot({ color, r = 5, opacity = 1 }: { readonly color: string; readonly r?: number; readonly opacity?: number }) {
  return (
    <svg width="14" height="14" aria-hidden>
      <circle cx="7" cy="7" r={r} fill={color} opacity={opacity} />
    </svg>
  );
}

const SIZE_TEXT: Readonly<Record<SizeBy, string>> = {
  alive: "Size: how alive × how much you said",
  links: "Size: number of connections",
  ideas: "Size: number of ideas",
};

const ROOMY = "(min-width: 1180px)";

/** Explains every encoding in words (following the current settings); collapsible. */
export function GraphLegend() {
  const [open, setOpen] = useState(() => window.matchMedia?.(ROOMY).matches ?? false);
  const { display, groups } = useGraphSettings();
  const named = groups.filter((g) => g.query.trim());
  const shaped = display.stateShapes || display.colorByState;
  return (
    <aside className={s.legend} aria-label="Map legend">
      <button type="button" className={s.legendToggle} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {open ? "Hide legend" : "Legend"}
      </button>
      {open && (
        <>
          <ul className={s.legendList}>
            {named.map((g) => (
              <li key={g.id}>
                <Dot color={`var(--group-${g.slot + 1})`} /> {SLOT_NAMES[g.slot]}: “{g.query}”
              </li>
            ))}
            {shaped &&
              TOPIC_STATES.map((state) => (
                <li key={state}>
                  <StateGlyph state={state} size={12} mono={!display.colorByState} /> {STATE_LABEL[state]}
                </li>
              ))}
            {!display.colorByState && (
              <li>
                <Dot color="var(--graph-node)" /> {named.length ? "Other topics" : "Topic"}
              </li>
            )}
            <li>
              <Dot color="var(--accent)" /> Hovered or selected, with its links
            </li>
          </ul>
          <ul className={s.legendList}>
            <li>
              <svg width="28" height="14" aria-hidden>
                <circle cx="5" cy="7" r="3" fill="var(--graph-node)" />
                <circle cx="20" cy="7" r="6" fill="var(--graph-node)" />
              </svg>
              {SIZE_TEXT[display.sizeBy]}
            </li>
            {display.fadeInactive && (
              <li>
                <svg width="28" height="14" aria-hidden>
                  <circle cx="7" cy="7" r="5" fill="var(--graph-node)" opacity="0.4" />
                  <circle cx="21" cy="7" r="5" fill="var(--graph-node)" />
                </svg>
                Faded: not mentioned lately
              </li>
            )}
            <li>
              <svg width="28" height="16" aria-hidden>
                <circle cx="14" cy="8" r="4" fill="var(--graph-node)" />
                <circle cx="14" cy="8" r="7" fill="none" stroke="var(--ink)" strokeDasharray="2 2" />
              </svg>
              New connection this week
            </li>
          </ul>
          <ul className={s.legendList}>
            <li>
              <EdgeSample width={2.2} color="var(--graph-edge-explicit)" /> You connected them
            </li>
            <li>
              <EdgeSample width={2} color="var(--graph-edge-note)" /> You linked them in a note
            </li>
            <li>
              <EdgeSample width={1.6} color="var(--graph-edge-cooc)" /> Came up together
            </li>
            <li>
              <EdgeSample width={1.2} color="var(--graph-edge-semantic)" dashed /> Similar (weak)
            </li>
          </ul>
          <p className={s.legendHelp}>{GRAPH_KEYS_HELP}</p>
        </>
      )}
    </aside>
  );
}
