import type { IsoDateTime, TopicId } from "./ids";
import type { Excerpt } from "./sources";
import type { TopicSummary } from "./topics";

/** Longest note the backend accepts, in characters. */
export const NOTE_MAX_CHARS = 200_000;

/**
 * The user's own markdown note on a topic, written in the app (never extracted).
 * `[[Title]]` or `[[Title|shown text]]` links to another topic by title or alias.
 */
export interface TopicNote {
  readonly topicId: TopicId;
  readonly body: string;
  /** Null until the first save. */
  readonly updatedAt: IsoDateTime | null;
}

/**
 * Another topic's note or idea that names this topic (its title or an alias, whole words,
 * ignoring case) without linking it. Matches inside `[[links]]` and code don't count.
 */
export interface UnlinkedMention {
  /** The topic whose note or idea mentions this one. */
  readonly topic: TopicSummary;
  readonly source: "note" | "idea";
  /** The note line, or the idea's excerpt text. */
  readonly text: string;
  /** The matched span in `text`, in UTF-16 code units (JavaScript string offsets). */
  readonly start: number;
  readonly end: number;
  /** 1-based line in the mentioning topic's note when `source` is "note". */
  readonly line: number | null;
  /** The idea's excerpt (with its source message) when `source` is "idea". */
  readonly excerpt: Excerpt | null;
}
