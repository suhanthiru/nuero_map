import type { Excerpt } from "./sources";
import type { GemId, IdeaId, IsoDateTime, TopicId } from "./ids";

export type TopicState = "active" | "parked" | "done" | "dead";
export const TOPIC_STATES: readonly TopicState[] = ["active", "parked", "done", "dead"];

export interface TopicSummary {
  readonly id: TopicId;
  readonly title: string;
  readonly aliases: readonly string[];
  readonly state: TopicState;
  /** 0..1, normalized decay score across all topics. */
  readonly decay: number;
  readonly ideaCount: number;
  readonly summary: string;
  readonly createdAt: IsoDateTime;
  readonly lastActiveAt: IsoDateTime;
  readonly checkInAt: IsoDateTime | null;
}

export type TopicSort = "decay" | "recent" | "ideas" | "name";

export interface TopicFilter {
  readonly states?: readonly TopicState[];
  readonly query?: string;
  readonly sort?: TopicSort;
  readonly limit?: number;
}

export type IdeaKind =
  | "question"
  | "insight"
  | "decision"
  | "plan"
  | "fact"
  | "problem"
  | "preference"
  | "reference";

export interface Idea {
  readonly id: IdeaId;
  readonly title: string;
  readonly summary: string;
  readonly kind: IdeaKind;
  readonly excerpt: Excerpt;
  readonly occurredAt: IsoDateTime;
  readonly isUserOriginated: boolean;
  /** Set when this idea restates an earlier one; the timeline collapses it. */
  readonly duplicateOf: IdeaId | null;
}

export interface Gem {
  readonly id: GemId;
  readonly topicId: TopicId;
  readonly ideaId: IdeaId;
  readonly excerpt: Excerpt;
  readonly pinnedAt: IsoDateTime;
}
