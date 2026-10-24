import type { MarkdownConfig } from "@lezer/markdown";
import { tags } from "@lezer/highlight";

const BANG = 33;
const OPEN = 91;
const CLOSE = 93;
const PIPE = 124;
const NEWLINE = 10;

/**
 * `[[target]]`, `[[target|shown]]` and `![[embed]]` as markdown syntax nodes:
 * WikiLink > WikiLinkMark, WikiLinkTarget, (WikiLinkMark, WikiLinkAlias), WikiLinkMark.
 * Same shape the reading view accepts (no brackets inside, no line breaks, not empty).
 */
export const wikilinkSyntax: MarkdownConfig = {
  defineNodes: [
    { name: "WikiLink", style: tags.link },
    { name: "WikiLinkMark", style: tags.processingInstruction },
    "WikiLinkTarget",
    "WikiLinkAlias",
  ],
  parseInline: [
    {
      name: "WikiLink",
      before: "Link",
      parse(cx, next, pos) {
        const start = pos;
        let at = pos;
        if (next === BANG && cx.char(at + 1) === OPEN && cx.char(at + 2) === OPEN) at += 1;
        else if (!(next === OPEN && cx.char(at + 1) === OPEN)) return -1;
        const textStart = at + 2;
        let end = -1;
        let pipe = -1;
        for (let i = textStart; i < cx.end; i++) {
          const c = cx.char(i);
          if (c === NEWLINE || c === OPEN) return -1;
          if (c === PIPE && pipe < 0) pipe = i;
          if (c === CLOSE) {
            if (cx.char(i + 1) !== CLOSE) return -1;
            end = i;
            break;
          }
        }
        if (end < 0 || end === textStart || pipe === textStart || pipe === end - 1) return -1;
        const children = [cx.elt("WikiLinkMark", start, textStart)];
        if (pipe >= 0) {
          children.push(cx.elt("WikiLinkTarget", textStart, pipe), cx.elt("WikiLinkMark", pipe, pipe + 1), cx.elt("WikiLinkAlias", pipe + 1, end));
        } else {
          children.push(cx.elt("WikiLinkTarget", textStart, end));
        }
        children.push(cx.elt("WikiLinkMark", end, end + 2));
        return cx.addElement(cx.elt("WikiLink", start, end + 2, children));
      },
    },
  ],
};
