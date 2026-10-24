import { syntaxTree } from "@codemirror/language";
import type { EditorState, Range } from "@codemirror/state";
import { Decoration, type DecorationSet } from "@codemirror/view";
import type { SyntaxNode } from "@lezer/common";
import { calloutKind } from "../model/callouts";
import { plainText } from "../model/note";
import { CalloutMarkerWidget, CheckboxWidget, RuleWidget } from "./widgets";

/**
 * Live preview, after the notes-app model: markdown syntax is hidden and the text styled,
 * except where the caret is. Inline syntax (emphasis, code, links) shows while a selection
 * touches it; line syntax (heading #, quote >, rules) shows while the caret is on its line.
 * An unfocused editor renders everything.
 */
export interface PreviewOptions {
  readonly focused: boolean;
  /** Whether a `[[target]]` names an existing topic (unresolved links are dimmed). */
  readonly resolves: (target: string) => boolean;
  /** Only build for this range (the visible part of a long note). Defaults to the whole note. */
  readonly from?: number;
  readonly to?: number;
}

const CALLOUT = /^\s*>\s?\[!([A-Za-z-]+)\]([+-]?)[ \t]*(.*)$/;
const INLINE_STYLE: Readonly<Record<string, { readonly mark: string; readonly cls: string }>> = {
  Emphasis: { mark: "EmphasisMark", cls: "cm-lp-em" },
  StrongEmphasis: { mark: "EmphasisMark", cls: "cm-lp-strong" },
  Strikethrough: { mark: "StrikethroughMark", cls: "cm-lp-strike" },
  InlineCode: { mark: "CodeMark", cls: "cm-lp-code" },
};

const hide = Decoration.replace({});

function children(node: SyntaxNode, name?: string): SyntaxNode[] {
  const out: SyntaxNode[] = [];
  for (let c = node.firstChild; c; c = c.nextSibling) if (!name || c.name === name) out.push(c);
  return out;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function buildPreview(state: EditorState, opts: PreviewOptions): DecorationSet {
  const doc = state.doc;
  const ranges = state.selection.ranges;
  const out: Range<Decoration>[] = [];
  const touches = (from: number, to: number) => opts.focused && ranges.some((r) => r.from <= to && r.to >= from);
  const lineOf = (pos: number) => doc.lineAt(pos);
  const onLine = (pos: number) => {
    const line = lineOf(pos);
    return touches(line.from, line.to);
  };
  const charAt = (pos: number) => (pos >= 0 && pos < doc.length ? doc.sliceString(pos, pos + 1) : "");
  // A plugin may never replace a line break (CodeMirror throws), so anything spanning lines stays as written.
  const replace = (from: number, to: number, deco: Decoration = hide) => {
    if (to > from && doc.lineAt(from).number === doc.lineAt(to).number) out.push(deco.range(from, to));
  };
  const lineClass = (pos: number, cls: string, attributes?: Record<string, string>) =>
    out.push(Decoration.line({ class: cls, attributes }).range(lineOf(pos).from));
  const eachLine = (from: number, to: number, fn: (lineFrom: number, index: number) => void) => {
    for (let pos = from, i = 0; pos <= to; i++) {
      const line = lineOf(pos);
      fn(line.from, i);
      pos = line.to + 1;
    }
  };

  const heading = (node: SyntaxNode, level: number) => {
    lineClass(node.from, `cm-lp-h cm-lp-h${level}`);
    if (onLine(node.from)) return;
    for (const mark of children(node, "HeaderMark")) {
      // The opening #s take the space after them; closing #s take the space before.
      const opening = mark.from === lineOf(node.from).from || doc.sliceString(lineOf(node.from).from, mark.from).trim() === "";
      const from = !opening && charAt(mark.from - 1) === " " ? mark.from - 1 : mark.from;
      const to = opening && charAt(mark.to) === " " ? mark.to + 1 : mark.to;
      replace(from, to);
    }
  };

  const inlineStyle = (node: SyntaxNode, style: { mark: string; cls: string }) => {
    out.push(Decoration.mark({ class: style.cls }).range(node.from, node.to));
    if (touches(node.from, node.to)) return;
    for (const mark of children(node, style.mark)) replace(mark.from, mark.to);
  };

  const link = (node: SyntaxNode) => {
    const marks = children(node, "LinkMark");
    const url = children(node, "URL")[0];
    // `[text]` alone (no URL) is plain text in the reading view too; leave it be.
    if (marks.length < 2 || !url) return;
    const [open, close] = marks;
    if (close.from > open.to) {
      const href = url ? doc.sliceString(url.from, url.to) : "";
      out.push(Decoration.mark({ class: "cm-lp-link cm-lp-external", attributes: { "data-href": href } }).range(open.to, close.from));
    }
    if (touches(node.from, node.to)) return;
    replace(open.from, open.to);
    replace(close.from, node.to);
  };

  const wikilink = (node: SyntaxNode) => {
    const target = children(node, "WikiLinkTarget")[0];
    const alias = children(node, "WikiLinkAlias")[0];
    if (!target) return;
    const targetText = doc.sliceString(target.from, target.to);
    if (touches(node.from, node.to)) {
      out.push(Decoration.mark({ class: "cm-lp-wikilink-source" }).range(node.from, node.to));
      return;
    }
    const shown = alias ?? target;
    const cls = opts.resolves(targetText) ? "cm-lp-link cm-lp-wikilink" : "cm-lp-link cm-lp-wikilink cm-lp-unresolved";
    replace(node.from, shown.from);
    replace(shown.to, node.to);
    out.push(Decoration.mark({ class: cls, attributes: { "data-target": targetText } }).range(shown.from, shown.to));
  };

  const blockquote = (node: SyntaxNode) => {
    const first = lineOf(node.from);
    const callout = CALLOUT.exec(first.text);
    const kind = callout ? calloutKind(callout[1]) : null;
    eachLine(node.from, node.to, (lineFrom, i) => {
      if (!kind) lineClass(lineFrom, "cm-lp-quote");
      else lineClass(lineFrom, i === 0 ? "cm-lp-callout cm-lp-callout-title" : "cm-lp-callout", { "data-callout": kind });
    });
    if (!callout || onLine(first.from)) return;
    const markerFrom = first.from + first.text.indexOf("[!");
    const markerTo = markerFrom + `[!${callout[1]}]${callout[2]}`.length;
    const to = charAt(markerTo) === " " ? markerTo + 1 : markerTo;
    const label = callout[3].trim() ? "" : capitalize(callout[1].toLowerCase());
    replace(markerFrom, to, Decoration.replace({ widget: new CalloutMarkerWidget(kind!, label) }));
  };

  const listMark = (node: SyntaxNode) => {
    const item = node.parent;
    const list = item?.parent;
    if (!item || !list) return;
    if (list.name === "OrderedList") {
      out.push(Decoration.mark({ class: "cm-lp-number" }).range(node.from, node.to));
      return;
    }
    const isTask = children(item, "Task").length > 0;
    if (isTask && !onLine(node.from)) {
      replace(node.from, charAt(node.to) === " " ? node.to + 1 : node.to);
      return;
    }
    out.push(Decoration.mark({ class: "cm-lp-bullet" }).range(node.from, node.to));
  };

  const task = (node: SyntaxNode) => {
    const marker = children(node, "TaskMarker")[0];
    if (!marker) return;
    const checked = /x/i.test(doc.sliceString(marker.from, marker.to));
    // Named after the task's first line, as a reader sees it.
    const label = plainText(doc.sliceString(marker.to, Math.min(node.to, lineOf(marker.from).to)));
    if (checked && node.to > marker.to) out.push(Decoration.mark({ class: "cm-lp-task-done" }).range(marker.to, node.to));
    if (touches(marker.from, marker.to)) return;
    const to = charAt(marker.to) === " " ? marker.to + 1 : marker.to;
    replace(marker.from, to, Decoration.replace({ widget: new CheckboxWidget(checked, label) }));
  };

  syntaxTree(state).iterate({
    from: opts.from ?? 0,
    to: opts.to ?? doc.length,
    enter: (ref) => {
      const node = ref.node;
      const name = ref.name;
      const h = /^ATXHeading(\d)$/.exec(name);
      if (h) return void heading(node, Number(h[1]));
      if (name === "SetextHeading1" || name === "SetextHeading2") return void lineClass(node.from, `cm-lp-h cm-lp-h${name.slice(-1)}`);
      const style = INLINE_STYLE[name];
      if (style) return void inlineStyle(node, style);
      switch (name) {
        case "Link":
          return void link(node);
        case "WikiLink":
          wikilink(node);
          return false;
        case "Blockquote":
          return void blockquote(node);
        case "QuoteMark":
          if (!onLine(node.from)) replace(node.from, charAt(node.to) === " " ? node.to + 1 : node.to);
          return;
        case "ListMark":
          return void listMark(node);
        case "Task":
          return void task(node);
        case "FencedCode":
          eachLine(node.from, node.to, (lineFrom) => lineClass(lineFrom, "cm-lp-codeblock"));
          return false;
        case "HorizontalRule":
          if (!onLine(node.from)) replace(node.from, node.to, Decoration.replace({ widget: new RuleWidget() }));
          return;
        case "Escape":
          if (!onLine(node.from)) replace(node.from, node.from + 1);
          return;
        default:
          return;
      }
    },
  });

  return Decoration.set(out, true);
}
