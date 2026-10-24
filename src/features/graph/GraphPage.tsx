import { useEffect, useMemo, useRef, useState } from "react";
import { Square } from "lucide-react";
import { userMessageOf } from "../../api/errors";
import { useReducedMotion } from "../../shared/hooks/useReducedMotion";
import { EmptyState } from "../../shared/ui/Page";
import { useOpen, useTab } from "../workspace/useOpen";
import { EdgeEvidencePanel } from "./EdgeEvidencePanel";
import { GraphCanvas, type GraphCanvasHandle } from "./GraphCanvas";
import { GraphLegend } from "./GraphLegend";
import { GraphListView } from "./GraphListView";
import { GraphToolbar, type GraphMode } from "./GraphToolbar";
import { TopicPeek } from "./TopicPeek";
import { GraphControls } from "./controls/GraphControls";
import { useTimelapse } from "./interaction/useTimelapse";
import { filterGraph } from "./model/filterGraph";
import { useGraph } from "./queries";
import { useGraphSettings } from "./state/graphSettingsStore";
import s from "./Graph.module.css";

interface Props {
  /** Select and centre this topic (e.g. "show on map" from a topic page). */
  readonly focusTopicId?: string;
  /** Open the evidence for this connection. */
  readonly edgeId?: string;
}

const DATE_FORMAT = new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", timeZone: "UTC" });

export function GraphPage({ focusTopicId, edgeId }: Props) {
  const graph = useGraph();
  const { openTopic } = useOpen();
  const { active, focused } = useTab();
  const reduced = useReducedMotion();
  const filters = useGraphSettings((st) => st.filters);
  const canvas = useRef<GraphCanvasHandle>(null);
  const [mode, setMode] = useState<GraphMode>("map");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(focusTopicId ?? null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(edgeId ?? null);

  // The same tab can be pointed at a new focus ("show on map" again).
  useEffect(() => {
    if (!focusTopicId) return;
    setMode("map");
    setSelectedId(focusTopicId);
  }, [focusTopicId]);
  useEffect(() => setSelectedEdgeId(edgeId ?? null), [edgeId]);

  const visible = useMemo(() => (graph.data ? filterGraph(graph.data, filters) : { nodes: [], edges: [] }), [graph.data, filters]);
  const nodesById = useMemo(() => new Map((graph.data?.nodes ?? []).map((n) => [n.id, n])), [graph.data]);
  const selected = selectedId ? nodesById.get(selectedId) : undefined;
  const timelapse = useTimelapse(visible.nodes, reduced, active && mode === "map");

  const selectNode = (id: string) => {
    setSelectedId(id);
    setSelectedEdgeId(null);
  };
  const clear = () => {
    setSelectedId(null);
    setSelectedEdgeId(null);
  };
  const find = (id: string) => {
    setMode("map");
    selectNode(id);
    requestAnimationFrame(() => canvas.current?.centerOn(id));
  };

  // "/" jumps to the topic search, but only in the focused pane's visible tab.
  useEffect(() => {
    if (!focused) return;
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if (e.key === "/" && !typing && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        document.querySelector<HTMLInputElement>(`[data-tab-focused="true"] input[aria-label="Find a topic"]`)?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focused]);

  const panel = selectedEdgeId ? (
    <EdgeEvidencePanel edgeId={selectedEdgeId} onBack={selected ? () => setSelectedEdgeId(null) : null} onClose={clear} />
  ) : selected ? (
    <TopicPeek node={selected} edges={visible.edges} nodesById={nodesById} onOpen={openTopic} onSelectEdge={setSelectedEdgeId} onSelectNode={find} onClose={clear} />
  ) : null;
  const hasNodes = graph.data !== undefined && visible.nodes.length > 0;
  const { span } = timelapse;
  const replayNews =
    timelapse.phase === "playing" && span
      ? `Replaying how your map grew, ${DATE_FORMAT.format(span.start)} to ${DATE_FORMAT.format(span.end)}.`
      : timelapse.phase === "finished"
        ? "Replay finished."
        : "";

  return (
    <div className={s.page} data-tab-focused={focused}>
      <div className={s.body}>
        <div className={s.stage}>
          <GraphToolbar
            allNodes={visible.nodes}
            visibleCount={visible.nodes.length}
            edgeCount={visible.edges.length}
            mode={mode}
            settingsOpen={settingsOpen}
            onMode={setMode}
            onFind={find}
            onFit={() => canvas.current?.fit()}
            onToggleSettings={() => setSettingsOpen((o) => !o)}
          />
          {settingsOpen && <GraphControls animating={timelapse.playing} onAnimate={timelapse.toggle} onClose={() => setSettingsOpen(false)} />}
          {graph.isPending && <p className={s.status}>Drawing your map…</p>}
          {graph.error && <p className={s.status}>{userMessageOf(graph.error)}</p>}
          {graph.data && visible.nodes.length === 0 && (
            <div className={s.empty}>
              <EmptyState title="Nothing to show with these filters">Turn on more topic states, clear the search, or widen the time range.</EmptyState>
            </div>
          )}
          {hasNodes && mode === "map" && (
            <>
              <GraphCanvas
                ref={canvas}
                graph={visible}
                revealed={timelapse.revealed}
                selectedId={selectedId}
                selectedEdgeId={selectedEdgeId}
                onSelectNode={selectNode}
                onSelectEdge={setSelectedEdgeId}
                onClear={clear}
                onOpenTopic={openTopic}
              />
              <GraphLegend />
              {timelapse.at !== null && (
                // Visual readout only; screen readers hear the start and the end (below), not every step.
                <div className={s.timelapse}>
                  <span className={s.timelapseDate}>{DATE_FORMAT.format(timelapse.at)}</span>
                  <span>{timelapse.revealed?.size ?? 0} topics</span>
                  <button type="button" className={s.toolButton} onClick={timelapse.stop} aria-label="Stop the replay">
                    <Square size={13} aria-hidden />
                  </button>
                </div>
              )}
            </>
          )}
          {hasNodes && mode === "list" && <GraphListView graph={visible} onOpen={openTopic} onSelect={find} />}
          <p className="visually-hidden" aria-live="polite">
            {replayNews}
          </p>
        </div>
        {panel && <div className={s.side}>{panel}</div>}
      </div>
    </div>
  );
}
