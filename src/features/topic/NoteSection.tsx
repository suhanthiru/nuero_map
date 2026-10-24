import { lazy, Suspense, useCallback, useId, useRef } from "react";
import { BookOpen, NotebookPen, Pencil } from "lucide-react";
import { userMessageOf } from "../../api/errors";
import { relativeDays } from "../../shared/format/dates";
import { ErrorBoundary } from "../../shared/ui/ErrorBoundary";
import { useLinkTargets, useOpenLink } from "../vault/linkTargets";
import { useTab } from "../workspace/useOpen";
import { MarkdownView } from "./MarkdownView";
import { toggleTask } from "./model/note";
import { useNoteMode, useNoteModes } from "./noteMode";
import { useSaveTopicNote, useTopicNote } from "./queries";
import s from "./TopicPage.module.css";

// CodeMirror is only needed once you start writing, so it loads then.
const LivePreviewEditor = lazy(() => import("./livePreview/LivePreviewEditor").then((m) => ({ default: m.LivePreviewEditor })));

/** The user's own words on a topic: markdown, `[[links]]` to other topics, tasks, callouts. */
export function NoteSection({ topicId }: { readonly topicId: string }) {
  const { tabId } = useTab();
  const mode = useNoteMode(tabId);
  const setMode = useNoteModes((st) => st.setMode);
  const note = useTopicNote(topicId);
  const save = useSaveTopicNote(topicId);
  const targets = useLinkTargets();
  const openLink = useOpenLink();
  const headingId = useId();
  const modeButton = useRef<HTMLButtonElement>(null);
  const { mutate, mutateAsync } = save;
  const onSave = useCallback((text: string) => mutateAsync(text), [mutateAsync]);

  const body = note.data?.body ?? "";
  const onToggleTask = useCallback(
    (line: number) => {
      const next = toggleTask(body, line);
      if (next !== body) mutate(next);
    },
    [body, mutate],
  );
  const editing = mode === "editing" && note.isSuccess;
  const doneEditing = () => {
    setMode(tabId, "reading");
    // The editor unmounts; keep keyboard focus nearby instead of dropping it on the page.
    requestAnimationFrame(() => modeButton.current?.focus());
  };
  const status = save.isPending
    ? "Saving…"
    : save.isError
      ? `Not saved: ${userMessageOf(save.error)}`
      : note.data?.updatedAt
        ? `edited ${relativeDays(note.data.updatedAt)}`
        : null;

  return (
    <section className={s.notes} aria-labelledby={headingId} data-outline="notes">
      <div className={s.noteHead}>
        <h2 id={headingId} className={s.noteLabel}>
          <NotebookPen size={15} aria-hidden /> My notes
        </h2>
        {/* Only a failed save is announced; "Saving…" after every pause would be noise for screen readers. */}
        {status && (
          <span className={save.isError ? `${s.noteStatus} ${s.error}` : s.noteStatus} role={save.isError ? "alert" : undefined}>
            · {status}
          </span>
        )}
        {save.isError && (
          <button type="button" className={s.inlineLink} onClick={() => mutate(body)}>
            Retry
          </button>
        )}
        {note.isSuccess && (
          <button
            ref={modeButton}
            type="button"
            className={s.modeButton}
            aria-pressed={editing}
            title="Toggle reading and editing (Ctrl+E)"
            onClick={() => (editing ? doneEditing() : setMode(tabId, "editing"))}
          >
            {editing ? <BookOpen size={14} aria-hidden /> : <Pencil size={14} aria-hidden />}
            {editing ? "Done" : "Edit"}
          </button>
        )}
      </div>
      {note.isPending && <p className={s.muted}>Loading your note…</p>}
      {note.error && <p className={s.error}>{userMessageOf(note.error)}</p>}
      {note.isSuccess && editing && (
        <ErrorBoundary
          fallback={() => (
            <p className={s.error} role="alert">
              The editor hit a problem; your saved note is unchanged.{" "}
              <button type="button" className={s.inlineLink} onClick={doneEditing}>
                Back to reading view
              </button>
            </p>
          )}
        >
          <Suspense fallback={<p className={s.muted}>Opening the editor…</p>}>
            <LivePreviewEditor initial={body} external={body} topics={targets} onSave={onSave} onDone={doneEditing} onOpenTopic={openLink} />
          </Suspense>
        </ErrorBoundary>
      )}
      {note.isSuccess && !editing && body.trim() === "" && (
        <button type="button" className={s.emptyNote} onClick={() => setMode(tabId, "editing")}>
          Nothing written yet. Click to start a note; type [[ to link another topic.
        </button>
      )}
      {note.isSuccess && !editing && body.trim() !== "" && (
        <MarkdownView body={body} topics={targets} onOpenTopic={openLink} onToggleTask={onToggleTask} />
      )}
    </section>
  );
}
