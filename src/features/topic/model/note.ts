
/** Markdown links made from `[[wikilinks]]` use this scheme; the renderer turns them into topic links. */
export const WIKILINK_SCHEME = "wikilink:";

/** Backtick fences can't have a backtick in their info string (so ```code``` on one line isn't a fence). */
const FENCE_OPEN = /^ {0,3}(`{3,}(?=[^`]*$)|~{3,})/;
const FENCE_CLOSE = /^ {0,3}(`{3,}|~{3,})\s*$/;
const HEADING = /^ {0,3}(#{1,6})[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/;
/** An inline code span (left alone) or a wikilink: `[[target]]`, `[[target|shown]]`, `![[embed]]`. */
const CODE_OR_WIKILINK = /(`+)[^`]*?\1|!?\[\[([^[\]|\n]+)(?:\|([^[\]\n]+))?\]\]/g;
/** A task line, also inside blockquotes and callouts (`> - [ ] x`). */
const TASK = /^((?:\s*>)*\s*(?:[-*+]|\d+[.)])\s+\[)([ xX])(\])/;
const WORD = /[\p{L}\p{N}][\p{L}\p{N}'’_-]*/gu;

export interface NoteHeading {
  /** 1–6, as written (`#` is 1). */
  readonly level: number;
  /** Plain text: link brackets and emphasis markers removed. */
  readonly text: string;
  /** 1-based line in the note body; also the anchor id (`note-L<line>`). */
  readonly line: number;
}

/** Calls `onLine` for each line with whether it sits inside a fenced code block. */
function eachLine(body: string, onLine: (line: string, index: number, inCode: boolean) => void): void {
  let fence: string | null = null;
  body.split("\n").forEach((line, index) => {
    if (fence === null) {
      const opener = FENCE_OPEN.exec(line);
      if (opener) fence = opener[1];
      onLine(line, index, opener !== null);
      return;
    }
    const closer = FENCE_CLOSE.exec(line);
    if (closer && closer[1][0] === fence[0] && closer[1].length >= fence.length) fence = null;
    onLine(line, index, true);
  });
}

/** Text a reader sees: `[[a|b]]` → b, `[t](u)` → t, emphasis and code ticks dropped. */
export function plainText(markdown: string): string {
  return markdown
    .replace(/\[\[([^[\]|\n]+)\|([^[\]\n]+)\]\]/g, "$2")
    .replace(/\[\[([^[\]\n]+)\]\]/g, "$1")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_~`]+/g, "")
    .trim();
}

export function noteHeadings(body: string): NoteHeading[] {
  const headings: NoteHeading[] = [];
  eachLine(body, (line, index, inCode) => {
    if (inCode) return;
    const m = HEADING.exec(line);
    if (m) headings.push({ level: m[1].length, text: plainText(m[2]), line: index + 1 });
  });
  return headings;
}

export function wikilinkHref(target: string): string {
  return `${WIKILINK_SCHEME}${encodeURIComponent(target.trim())}`;
}

/**
 * The text a `wikilink:` href points at. It may end in a `#heading` part; resolve the
 * whole thing first, since titles like "C#" contain one.
 */
export function wikilinkTarget(href: string): string | null {
  if (!href.startsWith(WIKILINK_SCHEME)) return null;
  try {
    return decodeURIComponent(href.slice(WIKILINK_SCHEME.length)).trim();
  } catch {
    return null;
  }
}

/**
 * Rewrites `[[wikilinks]]` as ordinary markdown links so any markdown renderer can show
 * them (an `![[embed]]` becomes a plain link). Code blocks and code spans are left alone,
 * and line numbers never change.
 */
export function linkWikilinks(body: string): string {
  const out: string[] = [];
  eachLine(body, (line, _index, inCode) => {
    out.push(
      inCode
        ? line
        : line.replace(CODE_OR_WIKILINK, (match, ticks: string | undefined, target: string | undefined, shown: string | undefined) =>
            ticks || !target ? match : `[${(shown ?? target).trim()}](${wikilinkHref(target)})`,
          ),
    );
  });
  return out.join("\n");
}

/** Title first, then aliases, ignoring case. */
/** How link targets and names compare: case and runs of whitespace don't matter (the backend agrees). */
function linkKey(name: string): string {
  return name.replace(/\s+/g, " ").trim().toLowerCase();
}

/** What a link can match on: a title and its aliases. Topics and notes both have them. */
interface Named {
  readonly title: string;
  readonly aliases: readonly string[];
}

/** Title first, then aliases. `[[#Heading]]` points inside a note, never at a topic. */
export function resolveTopic<T extends Named>(target: string, topics: readonly T[]): T | undefined {
  const want = linkKey(target);
  if (!want || want.startsWith("#")) return undefined;
  return topics.find((t) => linkKey(t.title) === want) ?? topics.find((t) => t.aliases.some((a) => linkKey(a) === want));
}

/** Flips the checkbox of the task on a 1-based line. Anything else is returned unchanged. */
export function toggleTask(body: string, line: number): string {
  const lines = body.split("\n");
  const current = lines[line - 1];
  if (current === undefined || !TASK.test(current)) return body;
  lines[line - 1] = current.replace(TASK, (_m, open: string, mark: string, close: string) => `${open}${mark === " " ? "x" : " "}${close}`);
  return lines.join("\n");
}

export function countWords(text: string): number {
  return text.match(WORD)?.length ?? 0;
}

/** Characters as a reader counts them (an emoji is one). */
export function countChars(text: string): number {
  return [...text].length;
}

export interface WikilinkRef {
  /** What the link points at, as written (may end in `#heading`). */
  readonly target: string;
  /** 1-based line of the note. */
  readonly line: number;
  /** That line, verbatim. */
  readonly text: string;
}

/** Every `[[link]]` in a note, in order, skipping code blocks and code spans. */
export function wikilinkRefs(body: string): WikilinkRef[] {
  const refs: WikilinkRef[] = [];
  eachLine(body, (line, index, inCode) => {
    if (inCode) return;
    for (const m of line.matchAll(CODE_OR_WIKILINK)) {
      if (!m[1] && m[2]) refs.push({ target: m[2].trim(), line: index + 1, text: line });
    }
  });
  return refs;
}

/** The distinct things a note links to (lowercased, spaces collapsed, sorted): compare to see if links changed. */
export function wikilinkTargets(body: string): string[] {
  const norm = (t: string) => t.trim().replace(/\s+/g, " ").toLowerCase();
  return [...new Set(wikilinkRefs(body).map((r) => norm(r.target)))].filter(Boolean).sort();
}

/** The topic a link points at: the whole target first (titles like "C#"), then the part before `#`. */
export function resolveLinkTarget<T extends Named>(target: string, topics: readonly T[]): T | undefined {
  return resolveTopic(target, topics) ?? resolveTopic(target.split("#")[0], topics);
}

/** The note's lines outside fenced code blocks, with their 1-based numbers. */
export function proseLines(body: string): { readonly line: number; readonly text: string }[] {
  const lines: { line: number; text: string }[] = [];
  eachLine(body, (text, index, inCode) => {
    if (!inCode) lines.push({ line: index + 1, text });
  });
  return lines;
}
