import type { TopicSummary } from "../../../api/contract";

/**
 * Something a `[[link]]` can point at: a topic, or one of the user's own notes. Topics are
 * passed as they are; a note's `id` is `note:<noteId>` so the two never collide.
 */
export interface LinkTarget {
  readonly id: string;
  readonly title: string;
  readonly aliases: readonly string[];
  /** Ranks suggestions that match equally well (notes use 0). */
  readonly decay: number;
  /** Shown beside the title in the `[[` suggester (a note's folder, say). */
  readonly hint?: string;
}

const NOTE_PREFIX = "note:";

export function noteLinkId(noteId: string): string {
  return `${NOTE_PREFIX}${noteId}`;
}

/** The note a link target id names, or null for a topic. */
export function noteIdOfLink(id: string): string | null {
  return id.startsWith(NOTE_PREFIX) ? id.slice(NOTE_PREFIX.length) : null;
}

/** Topic targets carry the whole summary, which the hover preview shows. */
export function isTopicTarget(target: LinkTarget): target is TopicSummary {
  return noteIdOfLink(target.id) === null && "state" in target;
}
