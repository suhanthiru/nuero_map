import type { Completion, CompletionContext, CompletionResult, CompletionSource } from "@codemirror/autocomplete";
import type { EditorView } from "@codemirror/view";
import { wikilinkQuery } from "../model/editing";
import type { LinkTarget } from "../model/linkTarget";
import { suggestTopics } from "../model/suggest";

const LIMIT = 12;

/** The rest of a link the caret is already inside (`|alias]]`, `ther]]`), so completing replaces it whole. */
const REST_OF_LINK = /^[^[\]\n]*\]\]/;

/** Inserts `Title]]` after the `[[`, replacing the rest of a link that's already there. */
function applyTopic(title: string) {
  return (view: EditorView, _completion: Completion, from: number, to: number) => {
    const line = view.state.doc.lineAt(to);
    const rest = REST_OF_LINK.exec(view.state.sliceDoc(to, line.to))?.[0] ?? "";
    const insert = `${title}]]`;
    view.dispatch({
      changes: { from, to: to + rest.length, insert },
      selection: { anchor: from + insert.length },
      userEvent: "input.complete",
    });
  };
}

/** Typing `[[` offers topics and notes by title or alias, ranked like the quick switcher. */
export function topicLinkCompletions(topics: () => readonly LinkTarget[]): CompletionSource {
  return (ctx: CompletionContext): CompletionResult | null => {
    const line = ctx.state.doc.lineAt(ctx.pos);
    const q = wikilinkQuery(line.text, ctx.pos - line.from);
    if (!q) return null;
    const options = suggestTopics(topics(), q.query, LIMIT).map(
      (t): Completion => ({ label: t.title, detail: t.hint ?? t.aliases[0], type: "topic", apply: applyTopic(t.title) }),
    );
    return { from: line.from + q.from + 2, options, filter: false };
  };
}
