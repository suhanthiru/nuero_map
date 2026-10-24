import type { Excerpt } from "./sources";
import type { EdgeId, IsoDateTime, TopicId } from "./ids";
import type { TopicSummary } from "./topics";

/**
 * Why two topics are connected, strongest first. `note` means only a `[[link]]` in one
 * of the two topics' notes connects them (no chat evidence yet).
 */
export type EdgeKind = "explicit" | "note" | "cooccurrence" | "semantic";

export interface GraphNode extends TopicSummary {
  /** Gained a new connection in the last few days. */
  readonly recentlyLinked: boolean;
}

export interface GraphEdge {
  readonly id: EdgeId;
  readonly source: TopicId;
  readonly target: TopicId;
  readonly kind: EdgeKind;
  /** 0..1 */
  readonly strength: number;
  readonly evidenceCount: number;
  readonly lastSeenAt: IsoDateTime;
  /** Also linked with `[[…]]` in either topic's note (always true for kind `note`). */
  readonly linkedInNote?: boolean;
}

/** One `[[link]]` in a topic's note: where it is, and the line it sits on for context. */
export interface NoteLinkRef {
  /** The topic whose note holds the link. */
  readonly topicId: TopicId;
  /** 1-based line in that note. */
  readonly line: number;
  /** That line of the note, verbatim. */
  readonly text: string;
}

export interface GraphData {
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
  readonly generatedAt: IsoDateTime;
}

export interface GraphOptions {
  readonly includeDead?: boolean;
  readonly includeSemantic?: boolean;
}

export interface EdgeEvidence {
  readonly edge: GraphEdge;
  readonly topics: readonly [TopicSummary, TopicSummary];
  readonly excerpts: readonly Excerpt[];
  /** The note lines that link the two topics, if any. */
  readonly noteLinks?: readonly NoteLinkRef[];
}
