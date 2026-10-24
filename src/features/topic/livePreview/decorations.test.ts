import { describe, expect, it } from "vitest";
import { ensureSyntaxTree } from "@codemirror/language";
import { EditorSelection, EditorState } from "@codemirror/state";
import type { Decoration } from "@codemirror/view";
import { buildPreview } from "./decorations";
import { CalloutMarkerWidget, CheckboxWidget, RuleWidget } from "./widgets";
import { noteMarkdown } from "./noteLanguage";

interface Rendered {
  /** The note as it looks: hidden syntax removed, widgets as [Name]. */
  readonly text: string;
  readonly marks: readonly { readonly cls: string; readonly text: string; readonly attrs?: Record<string, string> }[];
  readonly lines: readonly { readonly line: number; readonly cls: string; readonly attrs?: Record<string, string> }[];
  readonly widgets: readonly Decoration["spec"]["widget"][];
}

const CARET = "§";

/** `§` marks the caret; with no `§` the editor is unfocused. */
function render(source: string, resolves: (t: string) => boolean = () => true): Rendered {
  const caret = source.indexOf(CARET);
  const doc = source.replace(CARET, "");
  const state = EditorState.create({
    doc,
    selection: EditorSelection.cursor(Math.max(0, caret)),
    extensions: [noteMarkdown()],
  });
  ensureSyntaxTree(state, doc.length, 5000);
  const set = buildPreview(state, { focused: caret >= 0, resolves });
  const marks: { cls: string; text: string; attrs?: Record<string, string> }[] = [];
  const lines: { line: number; cls: string; attrs?: Record<string, string> }[] = [];
  const widgets: Decoration["spec"]["widget"][] = [];
  const cuts: { from: number; to: number; label: string }[] = [];
  set.between(0, doc.length, (from, to, deco) => {
    const spec = deco.spec as { class?: string; attributes?: Record<string, string>; widget?: unknown };
    if (spec.widget) {
      widgets.push(spec.widget as Decoration["spec"]["widget"]);
      cuts.push({ from, to, label: `[${(spec.widget as object).constructor.name.replace("Widget", "")}]` });
    } else if (from === to && spec.class) lines.push({ line: state.doc.lineAt(from).number, cls: spec.class, attrs: spec.attributes });
    else if (spec.class) marks.push({ cls: spec.class, text: doc.slice(from, to), attrs: spec.attributes });
    else cuts.push({ from, to, label: "" });
  });
  let text = "";
  let at = 0;
  for (const c of cuts.sort((a, b) => a.from - b.from)) {
    text += doc.slice(at, c.from) + c.label;
    at = Math.max(at, c.to);
  }
  return { text: text + doc.slice(at), marks, lines, widgets };
}

describe("live preview", () => {
  it("hides heading marks except on the caret's line", () => {
    expect(render("# Plans\n\ntext§").text).toBe("Plans\n\ntext");
    expect(render("# Pla§ns\n\ntext").text).toBe("# Plans\n\ntext");
    expect(render("## Sub\n§").lines).toContainEqual({ line: 1, cls: "cm-lp-h cm-lp-h2", attrs: undefined });
  });

  it("styles emphasis and code, showing their marks only while the selection touches them", () => {
    const away = render("a **bold** and `code` and *it*\n§");
    expect(away.text).toBe("a bold and code and it\n");
    expect(away.marks.map((m) => m.cls)).toEqual(expect.arrayContaining(["cm-lp-strong", "cm-lp-code", "cm-lp-em"]));
    expect(render("a **bo§ld** and `code`").text).toBe("a **bold** and code");
  });

  it("renders everything when the editor isn't focused", () => {
    expect(render("# Title\n**b**").text).toBe("Title\nb");
  });

  it("shows a wikilink's alias, marks unresolved links, and reveals the source under the caret", () => {
    const shown = render("see [[Async Rust|the runtime]] and [[Nope]]\n§",(t) => t === "Async Rust");
    expect(shown.text).toBe("see the runtime and Nope\n");
    expect(shown.marks).toContainEqual({ cls: "cm-lp-link cm-lp-wikilink", text: "the runtime", attrs: { "data-target": "Async Rust" } });
    expect(shown.marks).toContainEqual({ cls: "cm-lp-link cm-lp-wikilink cm-lp-unresolved", text: "Nope", attrs: { "data-target": "Nope" } });
    expect(render("see [[Async§ Rust]]").text).toBe("see [[Async Rust]]");
  });

  it("shows markdown links as their text, keeping the URL for the click", () => {
    const r = render("[site](https://example.com)\n§");
    expect(r.text).toBe("site\n");
    expect(r.marks).toContainEqual({ cls: "cm-lp-link cm-lp-external", text: "site", attrs: { "data-href": "https://example.com" } });
  });

  it("draws tasks as checkboxes, hiding their bullet, and strikes done ones", () => {
    const r = render("- [ ] open\n- [x] done\n- plain\n§");
    expect(r.text).toBe("[Checkbox]open\n[Checkbox]done\n- plain\n");
    const boxes = r.widgets.filter((w): w is CheckboxWidget => w instanceof CheckboxWidget);
    expect(boxes.map((b) => [b.checked, b.label])).toEqual([
      [false, "open"],
      [true, "done"],
    ]);
    expect(r.marks).toContainEqual({ cls: "cm-lp-task-done", text: " done", attrs: undefined });
    expect(r.marks.filter((m) => m.cls === "cm-lp-bullet")).toHaveLength(1);
  });

  it("turns callouts into tinted blocks with an icon in place of the marker", () => {
    const r = render("> [!tip]\n> body\n\n> [!warning] Careful\n> x\n\n§");
    const markers = r.widgets.filter((w): w is CalloutMarkerWidget => w instanceof CalloutMarkerWidget);
    expect(markers.map((m) => [m.kind, m.label])).toEqual([
      ["tip", "Tip"],
      ["warning", ""],
    ]);
    expect(r.text).toBe("[CalloutMarker]\nbody\n\n[CalloutMarker]Careful\nx\n\n");
    expect(r.lines).toContainEqual({ line: 1, cls: "cm-lp-callout cm-lp-callout-title", attrs: { "data-callout": "tip" } });
    expect(r.lines).toContainEqual({ line: 2, cls: "cm-lp-callout", attrs: { "data-callout": "tip" } });
  });

  it("leaves code blocks as written and draws rules away from the caret", () => {
    const r = render("```\n**not bold** [[x]]\n```\n\n---\n§");
    expect(r.text).toBe("```\n**not bold** [[x]]\n```\n\n[Rule]\n");
    expect(r.lines.filter((l) => l.cls === "cm-lp-codeblock")).toHaveLength(3);
    expect(r.widgets.some((w) => w instanceof RuleWidget)).toBe(true);
  });

  it("never hides across a line break (a link split over two lines stays as written)", () => {
    const r = render('see [a](http://x "ti\ntle") more\n§');
    expect(r.text).toContain('](http://x "ti\ntle")');
  });

  it("leaves [bracketed text] alone: without a URL it isn't a link", () => {
    const r = render("see [1] and [citation needed]\n§");
    expect(r.text).toBe("see [1] and [citation needed]\n");
    expect(r.marks.filter((m) => m.cls.includes("cm-lp-link"))).toEqual([]);
  });

  it("quotes hide their > away from the caret", () => {
    expect(render("> quoted\n\n§").text).toBe("quoted\n\n");
    expect(render("> quo§ted").text).toBe("> quoted");
  });
});
