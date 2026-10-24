import { useMemo } from "react";
import { Maximize2 } from "lucide-react";
import { userMessageOf } from "../../api/errors";
import { useOpen } from "../workspace/useOpen";
import { GraphCanvas } from "./GraphCanvas";
import { Slider } from "./controls/fields";
import { localGraph } from "./model/filterGraph";
import { useGraph } from "./queries";
import { useGraphSettings } from "./state/graphSettingsStore";
import s from "./Graph.module.css";

/**
 * The neighbourhood of one topic, for the right sidebar. Click a topic to go there,
 * Ctrl/middle-click for a new tab; depth widens the circle.
 */
export function LocalGraph({ topicId }: { readonly topicId: string }) {
  const graph = useGraph();
  const { open, openTopic } = useOpen();
  const filters = useGraphSettings((st) => st.filters);
  const depth = useGraphSettings((st) => st.localDepth);
  const setDepth = useGraphSettings((st) => st.setLocalDepth);
  const local = useMemo(() => (graph.data ? localGraph(graph.data, filters, topicId, depth) : null), [graph.data, filters, topicId, depth]);
  const title = graph.data?.nodes.find((n) => n.id === topicId)?.title ?? "this topic";

  return (
    <div className={s.local}>
      <div className={s.localHead}>
        <span>Local graph</span>
        <button
          type="button"
          className={s.toolButton}
          title="Open in the full graph"
          aria-label="Open in the full graph"
          onClick={(e) => open({ kind: "graph", focusTopicId: topicId }, e)}
        >
          <Maximize2 size={14} aria-hidden />
        </button>
      </div>
      <div className={s.localStage}>
        {graph.isPending && <p className={s.localNote}>Loading…</p>}
        {graph.error && <p className={s.localNote}>{userMessageOf(graph.error)}</p>}
        {local && local.nodes.length <= 1 && <p className={s.localNote}>No connections yet.</p>}
        {local && local.nodes.length > 1 && (
          <GraphCanvas
            graph={local}
            namespace="local"
            fitKey={`${topicId}:${depth}`}
            centerId={topicId}
            onOpenTopic={openTopic}
            label={`Local graph of ${title}`}
          />
        )}
      </div>
      <div className={s.localControls}>
        <Slider label="Depth" value={depth} min={1} max={3} step={1} onChange={setDepth} />
      </div>
    </div>
  );
}
