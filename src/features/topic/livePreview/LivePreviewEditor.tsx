import { useEffect, useId, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { autocompletion } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { EditorState, Transaction } from "@codemirror/state";
import { EditorView, keymap, placeholder } from "@codemirror/view";
import { NOTE_MAX_CHARS } from "../../../api/contract";
import { openExternal } from "../../../shared/links/openExternal";
import type { LinkTarget } from "../model/linkTarget";
import { resolveTopic } from "../model/note";
import { topicLinkCompletions } from "./linkCompletion";
import { livePreview, refreshPreview, wikilinkAt } from "./livePreview";
import { noteKeymap } from "./noteKeymap";
import { noteMarkdown } from "./noteLanguage";
import s from "./LivePreview.module.css";

const SAVE_DELAY_MS = 700;

export interface LivePreviewEditorProps {
  readonly initial: string;
  /** The stored body as the rest of the app sees it (another pane may be editing it too). */
  readonly external: string;
  /** What `[[links]]` can point at: topics, and notes where the page offers them. */
  readonly topics: readonly LinkTarget[];
  /** Rejects when the save fails, so the editor knows its text isn't stored yet. */
  readonly onSave: (body: string) => Promise<unknown>;
  readonly onDone: () => void;
  /** Opens a link target by its id (a topic id, or `note:<id>`). */
  readonly onOpenTopic: (topicId: string, e: ReactMouseEvent | MouseEvent | KeyboardEvent) => void;
  /** The editor's accessible name. */
  readonly label?: string;
  /** Take focus when it opens (off when something else on the page should, like a new note's title). */
  readonly autoFocus?: boolean;
}

function resolve(target: string, topics: readonly LinkTarget[]): LinkTarget | undefined {
  return resolveTopic(target, topics) ?? resolveTopic(target.split("#")[0], topics);
}

/**
 * Editing view of a note, as live preview: the markdown is there to edit, but headings,
 * emphasis, links, tasks and callouts look as they will when read, except right where
 * you're typing. Saves a moment after you stop, and again when it closes.
 */
export function LivePreviewEditor({ initial, external, topics, onSave, onDone, onOpenTopic, label = "My notes, in markdown", autoFocus = true }: LivePreviewEditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const hintId = useId();
  /** The last body handed to a save that hasn't failed; null after a failure, so the next flush retries. */
  const saved = useRef<string | null>(initial);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [overLimit, setOverLimit] = useState(false);
  const latest = useRef({ topics, onSave, onDone, onOpenTopic, onLimit: () => setOverLimit(true) });
  latest.current = { topics, onSave, onDone, onOpenTopic, onLimit: () => setOverLimit(true) };

  const save = useRef((body: string) => {
    saved.current = body;
    latest.current.onSave(body).catch(() => {
      if (saved.current === body) saved.current = null;
    });
  });

  useEffect(() => {
    const flush = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      const body = view.current?.state.doc.toString();
      if (body !== undefined && body !== saved.current) save.current(body);
    };
    const followLink = (v: EditorView): boolean => {
      const target = wikilinkAt(v.state, v.state.selection.main.head);
      const topic = target ? resolve(target, latest.current.topics) : undefined;
      if (!topic) return false;
      latest.current.onOpenTopic(topic.id, new KeyboardEvent("keydown"));
      return true;
    };
    const editor = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: initial,
        selection: { anchor: initial.length },
        extensions: [
          keymap.of(noteKeymap(() => ({ onDone: () => latest.current.onDone(), followLink }))),
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          noteMarkdown(),
          EditorView.lineWrapping,
          placeholder("Write in markdown. Type [[ to link a topic or note."),
          EditorView.contentAttributes.of({ "aria-label": label, "aria-describedby": hintId, spellcheck: "true" }),
          // A note has a size limit; an edit that would cross it is refused, and the editor says why.
          EditorState.transactionFilter.of((tr) => {
            if (!tr.docChanged || tr.newDoc.length <= NOTE_MAX_CHARS) return tr;
            latest.current.onLimit();
            return [];
          }),
          livePreview(() => ({
            resolves: (target) => resolve(target, latest.current.topics) !== undefined,
            openTarget: (target, e) => {
              const topic = resolve(target, latest.current.topics);
              if (topic) latest.current.onOpenTopic(topic.id, e);
            },
            openUrl: openExternal,
          })),
          autocompletion({ override: [topicLinkCompletions(() => latest.current.topics)], icons: false }),
          EditorView.updateListener.of((u) => {
            if (!u.docChanged) return;
            setOverLimit(false);
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(flush, SAVE_DELAY_MS);
          }),
        ],
      }),
    });
    view.current = editor;
    if (autoFocus) editor.focus();
    // Closing the editor (Esc, the mode toggle, another tab), hiding or closing the window
    // never loses the last few keystrokes.
    const onHidden = () => document.visibilityState === "hidden" && flush();
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onHidden);
      flush();
      editor.destroy();
      view.current = null;
    };
    // The editor is created once; later props are read through `latest`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // New or renamed topics change which links resolve.
  useEffect(() => {
    view.current?.dispatch({ effects: refreshPreview.of(null) });
  }, [topics]);

  // The same note edited in another pane: take its text while this one has nothing unsaved.
  useEffect(() => {
    const editor = view.current;
    if (!editor) return;
    const doc = editor.state.doc.toString();
    if (external === doc || doc !== saved.current || editor.hasFocus) return;
    saved.current = external;
    editor.dispatch({ changes: { from: 0, to: doc.length, insert: external }, annotations: Transaction.addToHistory.of(false) });
  }, [external]);

  return (
    <div>
      <div ref={host} className={s.editor} />
      {overLimit && (
        <p className={s.limit} role="alert">
          A note can be up to {NOTE_MAX_CHARS.toLocaleString("en")} characters; that change would go past it.
        </p>
      )}
      <p id={hintId} className={s.hint}>
        <kbd>[[</kbd> link a topic or note · <kbd>Ctrl</kbd>+<kbd>B</kbd> bold · <kbd>Ctrl</kbd>+<kbd>I</kbd> italic · <kbd>Ctrl</kbd>+<kbd>L</kbd> task ·{" "}
        <kbd>Alt</kbd>+<kbd>Enter</kbd> open link · <kbd>Esc</kbd> done. Saves as you type.
      </p>
    </div>
  );
}
