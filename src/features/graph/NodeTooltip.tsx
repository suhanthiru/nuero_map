import type { GraphEdge, GraphNode } from "../../api/contract";
import { relativeDays } from "../../shared/format/dates";
import { STATE_LABEL, StateGlyph } from "../../shared/ui/StateGlyph";
import { EDGE_KIND_LABEL } from "./model/describe";
import type { Point } from "./model/types";
import s from "./Graph.module.css";

const OFFSET = 14;
const MAX_WIDTH = 280;

function place(at: Point, viewport: { width: number; height: number }): { left: number; top: number } {
  const left = Math.min(at.x + OFFSET, viewport.width - MAX_WIDTH - 8);
  const top = at.y + OFFSET + 120 > viewport.height ? at.y - 120 : at.y + OFFSET;
  return { left: Math.max(8, left), top: Math.max(8, top) };
}

export function NodeTooltip({ node, at, viewport, connections }: {
  readonly node: GraphNode;
  readonly at: Point;
  readonly viewport: { width: number; height: number };
  readonly connections: number;
}) {
  return (
    <div className={s.tooltip} style={place(at, viewport)} aria-hidden>
      <p className={s.tooltipTitle}>{node.title}</p>
      <p className={s.tooltipMeta}>
        <StateGlyph state={node.state} size={10} /> {STATE_LABEL[node.state]} · {node.ideaCount} ideas · {connections} links ·{" "}
        {relativeDays(node.lastActiveAt)}
      </p>
      {node.summary && <p className={s.tooltipBody}>{node.summary}</p>}
    </div>
  );
}

export function EdgeTooltip({ edge, a, b, at, viewport }: {
  readonly edge: GraphEdge;
  readonly a: string;
  readonly b: string;
  readonly at: Point;
  readonly viewport: { width: number; height: number };
}) {
  return (
    <div className={s.tooltip} style={place(at, viewport)} aria-hidden>
      <p className={s.tooltipTitle}>
        {a} <span className={s.tooltipJoin}>↔</span> {b}
      </p>
      <p className={s.tooltipMeta}>
        {EDGE_KIND_LABEL[edge.kind]} · {edge.evidenceCount} excerpts · click to read
      </p>
    </div>
  );
}
