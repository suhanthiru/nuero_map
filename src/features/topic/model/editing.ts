/** Pure text edits for the note editor: each takes the text and selection, returns new ones. */
export interface TextEdit {
  readonly value: string;
  readonly start: number;
  readonly end: number;
}

const LIST_ITEM = /^(\s*)(?:([-*+])|(\d+)([.)]))(\s+)(\[[ xX]\]\s+)?/;
const OPEN_WIKILINK = /\[\[([^[\]|\n]*)$/;
const INDENT = "\t";

function lineBounds(value: string, at: number): { readonly start: number; readonly end: number } {
  const start = value.lastIndexOf("\n", at - 1) + 1;
  const nl = value.indexOf("\n", at);
  return { start, end: nl === -1 ? value.length : nl };
}

/** Tab / Shift+Tab on list lines indents or outdents them. Null when nothing would change. */
export function indentList(value: string, start: number, end: number, outdent: boolean): TextEdit | null {
  const first = lineBounds(value, start).start;
  const last = lineBounds(value, end).end;
  const lines = value.slice(first, last).split("\n");
  if (!lines.some((l) => LIST_ITEM.test(l))) return null;
  let shiftStart = 0;
  let shiftTotal = 0;
  const changed = lines.map((l, i) => {
    if (!LIST_ITEM.test(l)) return l;
    if (!outdent) {
      if (i === 0) shiftStart = INDENT.length;
      shiftTotal += INDENT.length;
      return INDENT + l;
    }
    const removed = l.startsWith(INDENT) ? INDENT.length : (/^ {1,4}/.exec(l)?.[0].length ?? 0);
    if (i === 0) shiftStart = -removed;
    shiftTotal -= removed;
    return l.slice(removed);
  });
  if (shiftTotal === 0) return null;
  const next = value.slice(0, first) + changed.join("\n") + value.slice(last);
  return { value: next, start: Math.max(first, start + shiftStart), end: Math.max(first, end + shiftTotal) };
}

/** Length of the run of `ch` ending at `at` (going left) or starting at `at` (going right). */
function runOf(value: string, at: number, ch: string, dir: -1 | 1): number {
  let n = 0;
  for (let i = dir < 0 ? at - 1 : at; i >= 0 && i < value.length && value[i] === ch; i += dir) n++;
  return n;
}

/**
 * Whether `mark` really wraps the selection. `*` is italic only in an odd run (`*x*`,
 * `***x***`): inside `**bold**` it isn't, so Ctrl+I adds italic instead of eating the bold.
 */
function wrappedBy(value: string, start: number, end: number, mark: string): boolean {
  if (mark !== "*") return true;
  return runOf(value, start, "*", -1) % 2 === 1 && runOf(value, end, "*", 1) % 2 === 1;
}

/** Ctrl+B / Ctrl+I: wraps the selection in `mark`, or unwraps it when it's already wrapped. */
export function toggleWrap(value: string, start: number, end: number, mark: string): TextEdit {
  const before = value.slice(start - mark.length, start);
  const after = value.slice(end, end + mark.length);
  if (before === mark && after === mark && wrappedBy(value, start, end, mark)) {
    const next = value.slice(0, start - mark.length) + value.slice(start, end) + value.slice(end + mark.length);
    return { value: next, start: start - mark.length, end: end - mark.length };
  }
  const next = value.slice(0, start) + mark + value.slice(start, end) + mark + value.slice(end);
  return { value: next, start: start + mark.length, end: end + mark.length };
}

export interface WikilinkQuery {
  /** Index of the opening `[[`. */
  readonly from: number;
  readonly query: string;
}

/** While the caret sits after an unclosed `[[` on the same line, what's typed so far. */
export function wikilinkQuery(value: string, caret: number): WikilinkQuery | null {
  const lineStart = value.lastIndexOf("\n", caret - 1) + 1;
  const m = OPEN_WIKILINK.exec(value.slice(lineStart, caret));
  return m ? { from: lineStart + (m.index ?? 0), query: m[1] } : null;
}

/** The smallest replaced span between two strings, so an edit can be applied as one minimal change. */
export function changedSpan(before: string, after: string): { readonly from: number; readonly to: number; readonly insert: string } {
  let from = 0;
  while (from < before.length && from < after.length && before[from] === after[from]) from++;
  let endBefore = before.length;
  let endAfter = after.length;
  while (endBefore > from && endAfter > from && before[endBefore - 1] === after[endAfter - 1]) {
    endBefore--;
    endAfter--;
  }
  return { from, to: endBefore, insert: after.slice(from, endAfter) };
}

const BULLET_TASK = /^(\s*(?:>\s*)*)([-*+]|\d+[.)])(\s+)(\[[ xX]\]\s+)?/;

/**
 * Ctrl+L on a line: plain text becomes `- [ ] text`, a list item gains a checkbox, and a
 * task flips between open and done.
 */
export function toggleChecklist(line: string): string {
  const m = BULLET_TASK.exec(line);
  if (!m) {
    const indent = /^\s*/.exec(line)?.[0] ?? "";
    return `${indent}- [ ] ${line.slice(indent.length)}`;
  }
  const [whole, prefix, marker, space, task] = m;
  const rest = line.slice(whole.length);
  if (!task) return `${prefix}${marker}${space}[ ] ${rest}`;
  const done = /x/i.test(task);
  return `${prefix}${marker}${space}[${done ? " " : "x"}] ${rest}`;
}
