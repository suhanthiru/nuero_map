import type { GraphEdge, GraphNode } from "../../../api/contract";
import { decayBucket } from "../../../shared/model/decay";
import { relativeDays } from "../../../shared/format/dates";
import { STATE_LABEL } from "../../../shared/ui/StateGlyph";

export const EDGE_KIND_LABEL: Readonly<Record<GraphEdge["kind"], string>> = {
  explicit: "you connected these",
  note: "you linked these in a note",
  cooccurrence: "came up together",
  semantic: "similar (weak)",
};

const BUCKET_LABEL = { hot: "hot", warm: "warm", fading: "fading", cold: "cold" } as const;

/** One sentence a screen reader announces when a topic gets keyboard focus. */
export function describeNode(n: GraphNode, connections: number, now: Date = new Date()): string {
  const ideas = `${n.ideaCount} ${n.ideaCount === 1 ? "idea" : "ideas"}`;
  const links = `${connections} ${connections === 1 ? "connection" : "connections"}`;
  return `${n.title}. ${STATE_LABEL[n.state]}, ${BUCKET_LABEL[decayBucket(n.decay)]}. ${ideas}, last active ${relativeDays(n.lastActiveAt, now)}. ${links}.`;
}

/** "3 excerpts", or for a link that only a note makes, "1 note link". */
export function edgeEvidenceLabel(e: GraphEdge): string {
  const n = e.evidenceCount;
  return e.kind === "note" ? `${n} note ${n === 1 ? "link" : "links"}` : `${n} ${n === 1 ? "excerpt" : "excerpts"}`;
}

export function describeEdge(e: GraphEdge, a: string, b: string): string {
  const alsoNote = e.linkedInNote && e.kind !== "note" ? ", also linked in a note" : "";
  return `${a} and ${b}: ${EDGE_KIND_LABEL[e.kind]}${alsoNote}, ${edgeEvidenceLabel(e)}.`;
}
