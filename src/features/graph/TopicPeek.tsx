import type { MouseEvent } from "react";
import type { GraphEdge, GraphNode } from "../../api/contract";
import { decayBucket } from "../../shared/model/decay";
import { relativeDays } from "../../shared/format/dates";
import { Button } from "../../shared/ui/Button";
import { STATE_LABEL, StateGlyph } from "../../shared/ui/StateGlyph";
import { EDGE_KIND_LABEL, edgeEvidenceLabel } from "./model/describe";
import s from "./Graph.module.css";

interface Props {
  readonly node: GraphNode;
  readonly edges: readonly GraphEdge[];
  readonly nodesById: ReadonlyMap<string, GraphNode>;
  readonly onOpen: (id: string, e?: MouseEvent) => void;
  readonly onSelectEdge: (id: string) => void;
  readonly onSelectNode: (id: string) => void;
  readonly onClose: () => void;
}

/** Quick look at a clicked topic and its connections, without leaving the map. */
export function TopicPeek({ node, edges, nodesById, onOpen, onSelectEdge, onSelectNode, onClose }: Props) {
  const links = edges
    .filter((e) => e.source === node.id || e.target === node.id)
    .map((e) => ({ edge: e, other: nodesById.get(e.source === node.id ? e.target : e.source) }))
    .filter((l): l is { edge: GraphEdge; other: GraphNode } => l.other !== undefined)
    .sort((a, b) => b.edge.strength - a.edge.strength);

  return (
    <section className={s.panel} aria-label={`Topic: ${node.title}`}>
      <button type="button" className={s.panelClose} onClick={onClose} aria-label="Close topic preview">
        ×
      </button>
      <p className={s.panelEyebrow}>
        <StateGlyph state={node.state} size={11} /> {STATE_LABEL[node.state]} · {decayBucket(node.decay)}
      </p>
      <h2 className={s.panelTitle}>{node.title}</h2>
      {node.summary && <p className={s.panelSummary}>{node.summary}</p>}
      <dl className={s.panelStats}>
        <div>
          <dt>Ideas</dt>
          <dd>{node.ideaCount}</dd>
        </div>
        <div>
          <dt>Last active</dt>
          <dd>{relativeDays(node.lastActiveAt)}</dd>
        </div>
        <div>
          <dt>Links</dt>
          <dd>{links.length}</dd>
        </div>
      </dl>
      <Button variant="primary" onClick={(e) => onOpen(node.id, e)} onAuxClick={(e) => onOpen(node.id, e)} title="Ctrl+click opens in a new tab">
        Open topic page
      </Button>
      {links.length > 0 && (
        <>
          <h3 className={s.panelHeading}>Connections</h3>
          <ul className={s.linkList}>
            {links.map(({ edge, other }) => (
              <li key={edge.id} className={s.linkItem}>
                <button type="button" className={s.linkTopic} onClick={() => onSelectNode(other.id)}>
                  <StateGlyph state={other.state} size={10} /> {other.title}
                </button>
                <button type="button" className={s.linkWhy} onClick={() => onSelectEdge(edge.id)}>
                  {EDGE_KIND_LABEL[edge.kind]} · {edgeEvidenceLabel(edge)} →
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
