import { proseLines } from "../../../features/topic/model/note";
import type { Idea, TopicNote, TopicSummary, UnlinkedMention } from "../../contract";

const MAX_PER_SOURCE = 50;
const WORDISH = /[\p{L}\p{N}]/u;
/** Spans a mention can't sit inside: code spans, `[[links]]`, `![[embeds]]`, `[text](url)` links. */
const LINKED_OR_CODE = /(`+)[^`]*?\1|!?\[\[[^[\]\n]+\]\]|\[[^\]\n]*\]\([^)\n]*\)/g;

export interface Span {
  readonly start: number;
  readonly end: number;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** If the name starts (ends) with a letter or digit, the match can't be preceded (followed) by one. */
function atWordEdges(text: string, name: string, start: number, end: number): boolean {
  const before = text.slice(0, start).match(/.$/su)?.[0] ?? "";
  const after = text.slice(end).match(/^./su)?.[0] ?? "";
  const first = name.match(/^./su)?.[0] ?? "";
  const last = name.match(/.$/su)?.[0] ?? "";
  if (WORDISH.test(first) && WORDISH.test(before)) return false;
  if (WORDISH.test(last) && WORDISH.test(after)) return false;
  return true;
}

/**
 * Where `text` names one of `names` as whole words, ignoring case, in UTF-16 offsets.
 * The longest name wins where names overlap; spans in `exclude` never match.
 */
export function findNameMatches(text: string, names: readonly string[], exclude: readonly Span[] = []): Span[] {
  const sorted = [...new Set(names.map((n) => n.trim()).filter(Boolean))].sort((a, b) => b.length - a.length);
  const found: Span[] = [];
  const overlaps = (s: Span, list: readonly Span[]) => list.some((o) => s.start < o.end && o.start < s.end);
  for (const name of sorted) {
    for (const m of text.matchAll(new RegExp(escapeRegExp(name), "giu"))) {
      const span = { start: m.index ?? 0, end: (m.index ?? 0) + m[0].length };
      if (atWordEdges(text, name, span.start, span.end) && !overlaps(span, found) && !overlaps(span, exclude)) found.push(span);
    }
  }
  return found.sort((a, b) => a.start - b.start);
}

function linkedOrCode(line: string): Span[] {
  return [...line.matchAll(LINKED_OR_CODE)].map((m) => ({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length }));
}

interface MentionInputs {
  readonly topicId: string;
  readonly topics: readonly TopicSummary[];
  readonly notes: ReadonlyMap<string, TopicNote>;
  /** Topics already connected to `topicId` (any edge or note link). */
  readonly connected: ReadonlySet<string>;
  readonly ideasOf: (topicId: string) => readonly Idea[];
}

/** Note mentions (any other topic's note), then idea mentions from topics not yet connected. */
export function unlinkedMentions({ topicId, topics, notes, connected, ideasOf }: MentionInputs): UnlinkedMention[] {
  const topic = topics.find((t) => t.id === topicId);
  if (!topic) throw { code: "not_found", message: `topic ${topicId}` };
  const names = [topic.title, ...topic.aliases];
  const byId = new Map(topics.map((t) => [t.id, t]));

  const fromNotes: UnlinkedMention[] = [];
  for (const note of notes.values()) {
    const source = byId.get(note.topicId);
    if (!source || note.topicId === topicId) continue;
    for (const { line, text } of proseLines(note.body)) {
      for (const span of findNameMatches(text, names, linkedOrCode(text))) {
        fromNotes.push({ topic: source, source: "note", text, ...span, line, excerpt: null });
      }
    }
  }

  const fromIdeas: UnlinkedMention[] = [];
  for (const source of topics) {
    if (source.id === topicId || connected.has(source.id)) continue;
    for (const idea of ideasOf(source.id)) {
      const [span] = findNameMatches(idea.excerpt.text, names);
      if (span) fromIdeas.push({ topic: source, source: "idea", text: idea.excerpt.text, ...span, line: null, excerpt: idea.excerpt });
    }
  }
  return [...fromNotes.slice(0, MAX_PER_SOURCE), ...fromIdeas.slice(0, MAX_PER_SOURCE)];
}
