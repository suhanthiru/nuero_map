import type { Element, ElementContent, Root, RootContent } from "hast";

/**
 * Callouts, written the way notes apps do:
 *
 *   > [!tip] Optional title
 *   > Body
 *
 * `[!type]-` starts folded, `[!type]+` starts open but foldable.
 */
export type CalloutKind = "note" | "abstract" | "info" | "todo" | "tip" | "success" | "question" | "warning" | "failure" | "danger" | "bug" | "example" | "quote";

const ALIASES: Readonly<Record<string, CalloutKind>> = {
  note: "note",
  abstract: "abstract",
  summary: "abstract",
  tldr: "abstract",
  info: "info",
  todo: "todo",
  tip: "tip",
  hint: "tip",
  important: "tip",
  success: "success",
  check: "success",
  done: "success",
  question: "question",
  help: "question",
  faq: "question",
  warning: "warning",
  caution: "warning",
  attention: "warning",
  failure: "failure",
  fail: "failure",
  missing: "failure",
  danger: "danger",
  error: "danger",
  bug: "bug",
  example: "example",
  quote: "quote",
  cite: "quote",
};

export type CalloutFold = "" | "+" | "-";

const MARKER = /^\[!([A-Za-z-]+)\]([+-]?)[ \t]*/;

export function calloutKind(type: string): CalloutKind {
  return ALIASES[type.toLowerCase()] ?? "note";
}

function isElement(node: RootContent | ElementContent | undefined, tag?: string): node is Element {
  return !!node && node.type === "element" && (!tag || node.tagName === tag);
}

/** Splits the first paragraph's first line (after the marker) off as the callout title. */
function splitTitle(p: Element, markerLength: number): { title: ElementContent[]; rest: ElementContent[] } {
  const [first, ...others] = p.children;
  if (first?.type !== "text") return { title: [], rest: p.children };
  const afterMarker = first.value.slice(markerLength);
  const nl = afterMarker.indexOf("\n");
  if (nl >= 0) {
    const title: ElementContent[] = afterMarker.slice(0, nl) ? [{ type: "text", value: afterMarker.slice(0, nl) }] : [];
    const remainder = afterMarker.slice(nl + 1);
    return { title, rest: [...(remainder ? [{ type: "text" as const, value: remainder }] : []), ...others] };
  }
  // The title line has inline formatting: it runs until the first text node with a line break.
  const title: ElementContent[] = afterMarker ? [{ type: "text", value: afterMarker }] : [];
  const rest: ElementContent[] = [];
  let inTitle = true;
  for (const node of others) {
    if (inTitle && node.type === "text" && node.value.includes("\n")) {
      const at = node.value.indexOf("\n");
      if (at > 0) title.push({ type: "text", value: node.value.slice(0, at) });
      const tail = node.value.slice(at + 1);
      if (tail) rest.push({ type: "text", value: tail });
      inTitle = false;
    } else if (inTitle) {
      title.push(node);
    } else {
      rest.push(node);
    }
  }
  return { title, rest };
}

function toCallout(quote: Element): Element | null {
  // The marker must open the blockquote: only whitespace may come before its paragraph.
  const firstIndex = quote.children.findIndex((c) => c.type !== "text" || c.value.trim() !== "");
  const p = quote.children[firstIndex];
  if (!isElement(p, "p") || p.children[0]?.type !== "text") return null;
  const m = MARKER.exec(p.children[0].value);
  if (!m) return null;
  const kind = calloutKind(m[1]);
  const fold = m[2] as CalloutFold;
  const { title, rest } = splitTitle(p, m[0].length);
  const body = [...(rest.length ? [{ ...p, children: rest }] : []), ...quote.children.slice(firstIndex + 1)];
  return {
    type: "element",
    tagName: "blockquote",
    properties: { ...quote.properties, dataCallout: kind, dataCalloutFold: fold, dataCalloutType: m[1].toLowerCase() },
    children: [
      { type: "element", tagName: "div", properties: { dataCalloutTitle: kind }, children: title },
      { type: "element", tagName: "div", properties: { dataCalloutBody: kind }, children: body },
    ],
  };
}

function transform<T extends Root | Element>(node: T): T {
  const children = node.children.map((child) => {
    if (!isElement(child)) return child;
    const walked = transform(child);
    return (walked.tagName === "blockquote" && toCallout(walked)) || walked;
  });
  return { ...node, children } as T;
}

/** Rehype plugin: turns `> [!type]` blockquotes into callouts the renderer can style. */
export function rehypeCallouts() {
  return (tree: Root): Root => transform(tree);
}
