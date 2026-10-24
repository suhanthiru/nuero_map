import type { Excerpt, SourceRef } from "./sources";
import type { IsoDateTime, SynthesisId } from "./ids";
import type { GraphEdge, NoteLinkRef } from "./graph";
import type { Gem, Idea, TopicSummary } from "./topics";

/** One line of a topic's "current state"; every line cites at least one message. */
export interface SynthesisLine {
  readonly text: string;
  readonly sources: readonly SourceRef[];
}

export interface SynthesisVersion {
  readonly id: SynthesisId;
  readonly version: number;
  readonly model: string;
  readonly createdAt: IsoDateTime;
  readonly lines: readonly SynthesisLine[];
}

export interface Connection {
  readonly edge: GraphEdge;
  readonly topic: TopicSummary;
  readonly evidence: readonly Excerpt[];
  /** `[[links]]` between the two topics in either one's note. */
  readonly noteLinks?: readonly NoteLinkRef[];
}

export interface TopicPage {
  readonly topic: TopicSummary;
  readonly current: SynthesisVersion | null;
  readonly history: readonly SynthesisVersion[];
  readonly gems: readonly Gem[];
  readonly ideas: readonly Idea[];
  readonly connections: readonly Connection[];
}
