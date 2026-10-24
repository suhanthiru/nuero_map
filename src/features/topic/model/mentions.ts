import type { UnlinkedMention } from "../../../api/contract";

export interface Snippet {
  readonly before: string;
  readonly match: string;
  readonly after: string;
}

const RADIUS = 90;

/** The text around a match, cut at word breaks with an ellipsis when the text is long. */
export function snippetAround(text: string, start: number, end: number, radius = RADIUS): Snippet {
  const from = Math.max(0, start - radius);
  const to = Math.min(text.length, end + radius);
  let before = text.slice(from, start);
  let after = text.slice(end, to);
  if (from > 0) before = `…${before.replace(/^\S*\s/, "")}`;
  if (to < text.length) after = `${after.replace(/\s\S*$/, "")}…`;
  return { before, match: text.slice(start, end), after };
}

/** `[[Title]]`, or `[[Title|as written]]` when the note wrote it differently (an alias, other case). */
export function linkFor(title: string, written: string): string {
  return written === title ? `[[${title}]]` : `[[${title}|${written}]]`;
}

/**
 * Turns a note mention into a link: the note body with that line's match replaced. Null
 * when the line no longer reads as it did when the mention was found.
 */
export function linkMentionInNote(body: string, mention: UnlinkedMention, title: string): string | null {
  if (mention.line === null) return null;
  const lines = body.split("\n");
  const line = lines[mention.line - 1];
  if (line !== mention.text) return null;
  const written = line.slice(mention.start, mention.end);
  if (!written) return null;
  lines[mention.line - 1] = line.slice(0, mention.start) + linkFor(title, written) + line.slice(mention.end);
  return lines.join("\n");
}

/** Adds `- [[Title]]` as a new last line of a note. */
export function appendLinkLine(body: string, title: string): string {
  const line = `- [[${title}]]`;
  return body.trim() ? `${body.replace(/\s*$/, "")}\n${line}\n` : `${line}\n`;
}

export interface MentionGroup {
  readonly topicId: string;
  readonly mentions: readonly UnlinkedMention[];
}

/** One group per mentioning topic, in the order the backend ranked them. */
export function groupMentions(mentions: readonly UnlinkedMention[]): MentionGroup[] {
  const groups = new Map<string, UnlinkedMention[]>();
  for (const m of mentions) groups.set(m.topic.id, [...(groups.get(m.topic.id) ?? []), m]);
  return [...groups.entries()].map(([topicId, list]) => ({ topicId, mentions: list }));
}
