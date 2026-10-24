import { describe, expect, it } from "vitest";
import { CompletionContext } from "@codemirror/autocomplete";
import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import type { TopicSummary } from "../../../api/contract";
import { topicLinkCompletions } from "./linkCompletion";

function topic(id: string, title: string, decay = 0.5): TopicSummary {
  return { id, title, aliases: [], state: "active", decay, ideaCount: 1, summary: "", createdAt: "", lastActiveAt: "", checkInAt: null };
}

const source = topicLinkCompletions(() => [topic("r", "Robot arm", 0.9), topic("s", "Rust")]);

function complete(doc: string, caret: number, pick = 0): string {
  const view = new EditorView({ state: EditorState.create({ doc, selection: EditorSelection.cursor(caret) }) });
  const result = source(new CompletionContext(view.state, caret, true));
  if (!result || result instanceof Promise) throw new Error("no completions");
  const option = result.options[pick];
  if (typeof option.apply !== "function") throw new Error("no apply");
  option.apply(view, option, result.from, caret);
  const out = view.state.doc.toString();
  view.destroy();
  return out;
}

describe("topicLinkCompletions", () => {
  it("offers topics after [[ and completes the link", () => {
    expect(complete("see [[ro", 8)).toBe("see [[Robot arm]]");
  });

  it("replaces the rest of a link the caret is inside instead of duplicating it", () => {
    expect(complete("see [[Rob|ot arm]] ok", 9)).toBe("see [[Robot arm]] ok");
    expect(complete("see [[Ro]]", 8)).toBe("see [[Robot arm]]");
  });

  it("stays quiet outside a link", () => {
    const view = new EditorView({ state: EditorState.create({ doc: "see [[done]] ", selection: EditorSelection.cursor(13) }) });
    expect(source(new CompletionContext(view.state, 13, true))).toBeNull();
    view.destroy();
  });
});
