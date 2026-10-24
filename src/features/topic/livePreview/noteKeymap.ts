import type { KeyBinding } from "@codemirror/view";
import { EditorView } from "@codemirror/view";
import { changedSpan, indentList, toggleChecklist, toggleWrap, type TextEdit } from "../model/editing";

/** Applies a whole-note edit as one minimal change, so undo steps back exactly over it. */
export function applyEdit(view: EditorView, edit: TextEdit, userEvent: string): boolean {
  const before = view.state.doc.toString();
  if (edit.value === before) return false;
  const span = changedSpan(before, edit.value);
  view.dispatch({
    changes: { from: span.from, to: span.to, insert: span.insert },
    selection: { anchor: edit.start, head: edit.end },
    userEvent,
    scrollIntoView: true,
  });
  return true;
}

function wrap(mark: string) {
  return (view: EditorView): boolean => {
    const { from, to } = view.state.selection.main;
    applyEdit(view, toggleWrap(view.state.doc.toString(), from, to, mark), "input.format");
    return true;
  };
}

/** Tab / Shift+Tab indent list lines only; elsewhere Tab keeps moving focus, so the editor is never a keyboard trap. */
function indent(outdent: boolean) {
  return (view: EditorView): boolean => {
    const { from, to } = view.state.selection.main;
    const edit = indentList(view.state.doc.toString(), from, to, outdent);
    return edit ? applyEdit(view, edit, outdent ? "delete.dedent" : "input.indent") : false;
  };
}

function checklist(view: EditorView): boolean {
  const line = view.state.doc.lineAt(view.state.selection.main.head);
  const next = toggleChecklist(line.text);
  const caret = Math.min(line.from + next.length, view.state.selection.main.head + (next.length - line.text.length));
  view.dispatch({
    changes: { from: line.from, to: line.to, insert: next },
    selection: { anchor: Math.max(line.from, caret) },
    userEvent: "input.toggle-task",
  });
  return true;
}

export interface NoteKeymapHandlers {
  /** Esc: leave the editor (back to reading view). */
  readonly onDone: () => void;
  /** Alt+Enter: open the `[[link]]` under the caret. */
  readonly followLink: (view: EditorView) => boolean;
}

export function noteKeymap(handlers: () => NoteKeymapHandlers): KeyBinding[] {
  return [
    { key: "Mod-b", run: wrap("**") },
    { key: "Mod-i", run: wrap("*") },
    { key: "Mod-l", run: checklist },
    { key: "Tab", run: indent(false), shift: indent(true) },
    { key: "Alt-Enter", run: (view) => handlers().followLink(view) },
    {
      key: "Escape",
      run: () => {
        handlers().onDone();
        return true;
      },
    },
  ];
}
