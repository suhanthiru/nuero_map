import { resolveLinkTarget, wikilinkRefs } from "../../../features/topic/model/note";
import type { GraphEdge, NoteLinkRef, TopicNote, TopicSummary } from "../../contract";

/** Strength given to a pair connected only by a note link (no chat evidence). */
const NOTE_EDGE_STRENGTH = 0.6;

export interface ResolvedNoteLink extends NoteLinkRef {
  /** The topic the link points at (`topicId` is the note that holds it). */
  readonly targetId: string;
}

export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** Every `[[link]]` in every note that resolves to another topic (self links dropped). */
export function resolveNoteLinks(notes: ReadonlyMap<string, TopicNote>, topics: readonly TopicSummary[]): ResolvedNoteLink[] {
  const links: ResolvedNoteLink[] = [];
  for (const note of notes.values()) {
    for (const ref of wikilinkRefs(note.body)) {
      const target = resolveLinkTarget(ref.target, topics);
      if (target && target.id !== note.topicId) links.push({ topicId: note.topicId, targetId: target.id, line: ref.line, text: ref.text });
    }
  }
  return links;
}

/** The note lines linking `a` and `b`, in either direction. */
export function noteLinksBetween(links: readonly ResolvedNoteLink[], a: string, b: string): NoteLinkRef[] {
  return links
    .filter((l) => (l.topicId === a && l.targetId === b) || (l.topicId === b && l.targetId === a))
    .map(({ topicId, line, text }) => ({ topicId, line, text }));
}

function noteEdgeId(a: string, b: string): string {
  const [x, y] = a < b ? [a, b] : [b, a];
  return `note-${x}~${y}`;
}

/**
 * Chat edges flagged where a note also links the pair, plus one `note` edge for each pair
 * only a note links. `notes` gives each synthetic edge its last-seen time.
 */
export function withNoteEdges(edges: readonly GraphEdge[], links: readonly ResolvedNoteLink[], notes: ReadonlyMap<string, TopicNote>): GraphEdge[] {
  const linked = new Map<string, ResolvedNoteLink[]>();
  for (const l of links) linked.set(pairKey(l.topicId, l.targetId), [...(linked.get(pairKey(l.topicId, l.targetId)) ?? []), l]);
  // A weak "similar" edge doesn't cover a link you made yourself: the note edge replaces it
  // (the map hides weak edges by default, which would hide the link too).
  const replaced = (e: GraphEdge) => e.kind === "semantic" && linked.has(pairKey(e.source, e.target));
  const kept = edges.filter((e) => !replaced(e));
  const existing = new Set(kept.map((e) => pairKey(e.source, e.target)));
  const flagged = kept.map((e) => (linked.has(pairKey(e.source, e.target)) ? { ...e, linkedInNote: true } : e));
  const extra = [...linked.entries()]
    .filter(([key]) => !existing.has(key))
    .map(([, pair]): GraphEdge => {
      const { topicId: source, targetId: target } = pair[0];
      const seen = pair.map((l) => notes.get(l.topicId)?.updatedAt ?? "").sort();
      return {
        id: noteEdgeId(source, target),
        source,
        target,
        kind: "note",
        strength: NOTE_EDGE_STRENGTH,
        evidenceCount: pair.length,
        lastSeenAt: seen[seen.length - 1] || new Date().toISOString(),
        linkedInNote: true,
      };
    });
  return [...flagged, ...extra];
}
