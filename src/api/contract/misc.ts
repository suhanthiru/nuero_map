import type { IsoDateTime, TopicId } from "./ids";
import type { TopicSummary } from "./topics";
import type { NoteId } from "./vault";

export interface SearchHit {
  readonly kind: "topic" | "idea" | "note";
  readonly id: string;
  readonly topicId: TopicId | null;
  /** Set for `note` hits: one of the user's own notes (title or text matched). */
  readonly noteId: NoteId | null;
  readonly title: string;
  readonly snippet: string;
  readonly score: number;
}

export interface MergeSuggestion {
  readonly id: string;
  readonly from: TopicSummary;
  readonly into: TopicSummary;
  readonly confidence: number;
  readonly reason: string;
  readonly sharedIdeaCount: number;
  readonly createdAt: IsoDateTime;
}

export type ShelfReason = "fading" | "parked" | "newConnection";

export interface ShelfCard {
  readonly reason: ShelfReason;
  readonly topic: TopicSummary;
  readonly detail: string;
  readonly relatedTopic?: TopicSummary;
}

export interface TodayShelf {
  readonly cards: readonly ShelfCard[];
  readonly generatedAt: IsoDateTime;
}

/** Error payload serialized by the Rust side. `code` is stable; `message` is for logs. */
export interface BackendError {
  readonly code: string;
  readonly message: string;
  readonly details?: string;
}
