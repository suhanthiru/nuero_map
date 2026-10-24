import { useState } from "react";
import { Maximize, Settings2 } from "lucide-react";
import type { GraphNode } from "../../api/contract";
import { SegmentedControl } from "../../shared/ui/SegmentedControl";
import { StateGlyph } from "../../shared/ui/StateGlyph";
import { searchNodes } from "./model/filterGraph";
import s from "./Graph.module.css";

export type GraphMode = "map" | "list";

const MODES: readonly { value: GraphMode; label: string }[] = [
  { value: "map", label: "Map" },
  { value: "list", label: "List" },
];

interface Props {
  readonly allNodes: readonly GraphNode[];
  readonly visibleCount: number;
  readonly edgeCount: number;
  readonly mode: GraphMode;
  readonly settingsOpen: boolean;
  readonly onMode: (mode: GraphMode) => void;
  readonly onFind: (id: string) => void;
  readonly onFit: () => void;
  readonly onToggleSettings: () => void;
}

function FindTopic({ nodes, onFind }: { readonly nodes: readonly GraphNode[]; readonly onFind: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const results = searchNodes(nodes, query);
  const choose = (id: string) => {
    onFind(id);
    setQuery("");
  };
  return (
    <div className={s.find} role="combobox" aria-expanded={results.length > 0} aria-haspopup="listbox" aria-owns="graph-find-results">
      <input
        className={s.findInput}
        type="search"
        placeholder="Find a topic  /"
        aria-label="Find a topic"
        aria-autocomplete="list"
        aria-controls="graph-find-results"
        aria-activedescendant={results[active] ? `find-${results[active].id}` : undefined}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") setActive((i) => Math.min(results.length - 1, i + 1));
          else if (e.key === "ArrowUp") setActive((i) => Math.max(0, i - 1));
          else if (e.key === "Enter" && results[active]) choose(results[active].id);
          else if (e.key === "Escape") setQuery("");
          else return;
          e.preventDefault();
        }}
      />
      {results.length > 0 && (
        <ul id="graph-find-results" role="listbox" className={s.findResults}>
          {results.map((n, i) => (
            <li
              key={n.id}
              id={`find-${n.id}`}
              role="option"
              aria-selected={i === active}
              className={s.findResult}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(n.id);
              }}
            >
              <StateGlyph state={n.state} size={10} /> {n.title}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Floating controls over the map: find, counts, map/list, fit, and the settings panel. */
export function GraphToolbar(p: Props) {
  return (
    <div className={s.toolbar} role="toolbar" aria-label="Map controls">
      <div className={s.toolCluster}>
        <FindTopic nodes={p.allNodes} onFind={p.onFind} />
        <span className={s.count} aria-live="polite">
          {p.visibleCount} topics · {p.edgeCount} links
        </span>
      </div>
      <div className={s.toolCluster}>
        <SegmentedControl label="View as" options={MODES} value={p.mode} onChange={p.onMode} size="sm" />
        {p.mode === "map" && (
          <button type="button" className={s.toolButton} onClick={p.onFit} title="Fit to screen (0)" aria-label="Fit to screen">
            <Maximize size={15} aria-hidden />
          </button>
        )}
        <button
          type="button"
          className={s.toolButton}
          aria-pressed={p.settingsOpen}
          aria-label="Graph settings"
          title="Graph settings: filters, groups, display, forces"
          onClick={p.onToggleSettings}
        >
          <Settings2 size={15} aria-hidden />
        </button>
      </div>
    </div>
  );
}
