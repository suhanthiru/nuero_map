import { Play, Plus, Square, X } from "lucide-react";
import { TOPIC_STATES } from "../../../api/contract";
import { SegmentedControl } from "../../../shared/ui/SegmentedControl";
import { STATE_LABEL, StateGlyph } from "../../../shared/ui/StateGlyph";
import type { SizeBy } from "../model/scales";
import type { TimeRange } from "../model/types";
import { GROUP_SLOTS, useGraphSettings } from "../state/graphSettingsStore";
import { Section, Slider, Toggle } from "./fields";
import s from "./Controls.module.css";

const RANGES: readonly { value: TimeRange; label: string }[] = [
  { value: "30d", label: "30d" },
  { value: "90d", label: "90d" },
  { value: "1y", label: "1y" },
  { value: "all", label: "All" },
];
const SIZES: readonly { value: SizeBy; label: string }[] = [
  { value: "alive", label: "Alive" },
  { value: "links", label: "Links" },
  { value: "ideas", label: "Ideas" },
];
export const SLOT_NAMES: readonly string[] = ["Blue", "Orange", "Green", "Amber", "Pink", "Violet"];

const times = (v: number) => `${v.toFixed(1)}×`;
const percent = (v: number) => `${Math.round(v * 100)}%`;

function FiltersSection() {
  const { filters, setFilters, toggleState, reset } = useGraphSettings();
  return (
    <Section title="Filters" defaultOpen onReset={() => reset("filters")}>
      <input
        className={s.search}
        type="search"
        placeholder="Search topics…"
        aria-label="Show only topics matching"
        title="Words match titles and aliases; state:parked matches a state"
        value={filters.query}
        onChange={(e) => setFilters({ query: e.target.value })}
      />
      <div className={s.states} role="group" aria-label="Show topics by state">
        {TOPIC_STATES.map((state) => (
          <button key={state} type="button" className={s.stateChip} aria-pressed={filters.states.includes(state)} onClick={() => toggleState(state)}>
            <StateGlyph state={state} size={10} /> {STATE_LABEL[state]}
          </button>
        ))}
      </div>
      <div className={s.row}>
        <span className={s.rowLabel}>Active within</span>
        <SegmentedControl label="Last active within" options={RANGES} value={filters.range} onChange={(range) => setFilters({ range })} size="sm" />
      </div>
      <Toggle label="Weak links" hint="Topics that are only similar, never discussed together" checked={filters.showWeak} onChange={(showWeak) => setFilters({ showWeak })} />
      <Toggle label="Orphans" hint="Topics with no visible connections" checked={filters.showOrphans} onChange={(showOrphans) => setFilters({ showOrphans })} />
    </Section>
  );
}

function GroupsSection() {
  const { groups, addGroup, updateGroup, removeGroup } = useGraphSettings();
  return (
    <Section title="Groups">
      {groups.length === 0 && <p className={s.hint}>Color topics that match a search, e.g. “design” or “state:parked”.</p>}
      <ul className={s.groups}>
        {groups.map((g) => (
          <li key={g.id} className={s.group}>
            <button
              type="button"
              className={s.swatch}
              style={{ background: `var(--group-${g.slot + 1})` }}
              aria-label={`Color: ${SLOT_NAMES[g.slot]}. Change color`}
              title="Change color"
              onClick={() => updateGroup(g.id, { slot: (g.slot + 1) % GROUP_SLOTS })}
            />
            <input
              className={s.groupQuery}
              type="text"
              placeholder="Search…"
              aria-label={`${SLOT_NAMES[g.slot]} group query`}
              value={g.query}
              onChange={(e) => updateGroup(g.id, { query: e.target.value })}
            />
            <button type="button" className={s.iconButton} aria-label={`Remove ${SLOT_NAMES[g.slot]} group`} onClick={() => removeGroup(g.id)}>
              <X size={14} aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className={s.addGroup} onClick={addGroup}>
        <Plus size={14} aria-hidden /> New group
      </button>
    </Section>
  );
}

function DisplaySection({ animating, onAnimate }: { readonly animating: boolean; readonly onAnimate: () => void }) {
  const { display, setDisplay, reset } = useGraphSettings();
  return (
    <Section title="Display" onReset={() => reset("display")}>
      <div className={s.row}>
        <span className={s.rowLabel}>Size by</span>
        <SegmentedControl label="Node size shows" options={SIZES} value={display.sizeBy} onChange={(sizeBy) => setDisplay({ sizeBy })} size="sm" />
      </div>
      <Slider label="Text fade threshold" value={display.textFade} min={0} max={1} step={0.05} format={percent} onChange={(textFade) => setDisplay({ textFade })} />
      <Slider label="Node size" value={display.nodeScale} min={0.5} max={2} step={0.1} format={times} onChange={(nodeScale) => setDisplay({ nodeScale })} />
      <Slider label="Link thickness" value={display.linkScale} min={0.3} max={3} step={0.1} format={times} onChange={(linkScale) => setDisplay({ linkScale })} />
      <Toggle label="Fade quiet topics" hint="Topics you haven't mentioned lately are drawn fainter" checked={display.fadeInactive} onChange={(fadeInactive) => setDisplay({ fadeInactive })} />
      <Toggle label="Color by state" checked={display.colorByState} onChange={(colorByState) => setDisplay({ colorByState })} />
      <Toggle
        label="State shapes"
        hint="Parked = ring, done = square, dead = dotted ring (always on with state colors)"
        checked={display.stateShapes || display.colorByState}
        disabled={display.colorByState}
        onChange={(stateShapes) => setDisplay({ stateShapes })}
      />
      <button type="button" className={s.animate} onClick={onAnimate} aria-pressed={animating}>
        {animating ? <Square size={13} aria-hidden /> : <Play size={13} aria-hidden />}
        {animating ? "Stop" : "Animate"}
      </button>
    </Section>
  );
}

function ForcesSection() {
  const { forces, setForces, reset } = useGraphSettings();
  return (
    <Section title="Forces" onReset={() => reset("forces")}>
      <Slider label="Center force" value={forces.center} min={0} max={1} step={0.05} format={percent} onChange={(center) => setForces({ center })} />
      <Slider label="Repel force" value={forces.repel} min={0} max={20} step={0.5} onChange={(repel) => setForces({ repel })} />
      <Slider label="Link force" value={forces.link} min={0} max={2} step={0.05} format={times} onChange={(link) => setForces({ link })} />
      <Slider label="Link distance" value={forces.distance} min={30} max={300} step={5} onChange={(distance) => setForces({ distance })} />
    </Section>
  );
}

interface Props {
  readonly animating: boolean;
  readonly onAnimate: () => void;
  readonly onClose: () => void;
}

/** Graph settings, laid out like a notes app's graph panel: filters, groups, display, forces. */
export function GraphControls({ animating, onAnimate, onClose }: Props) {
  return (
    <div className={s.panel} role="dialog" aria-label="Graph settings" onKeyDown={(e) => e.key === "Escape" && onClose()}>
      <div className={s.panelHead}>
        <span>Graph settings</span>
        <button type="button" className={s.iconButton} aria-label="Close graph settings" onClick={onClose}>
          <X size={14} aria-hidden />
        </button>
      </div>
      <FiltersSection />
      <GroupsSection />
      <DisplaySection animating={animating} onAnimate={onAnimate} />
      <ForcesSection />
    </div>
  );
}
