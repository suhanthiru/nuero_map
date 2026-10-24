import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { FileUp, Folder } from "lucide-react";
import type { VaultNote } from "../../api/contract";
import { userMessageOf } from "../../api/errors";
import { relativeDays } from "../../shared/format/dates";
import { ErrorBoundary } from "../../shared/ui/ErrorBoundary";
import { EmptyState } from "../../shared/ui/Page";
import { MarkdownView } from "../topic/MarkdownView";
import { toggleTask } from "../topic/model/note";
import { useNoteMode, useNoteModes } from "../topic/noteMode";
import { useTab } from "../workspace/useOpen";
import { useLinkTargets, useOpenLink } from "./linkTargets";
import { folderPath } from "./model/tree";
import { nameProblem, normalizeName } from "./model/names";
import { useRenameNote, useSaveVaultNote, useVault, useVaultNote } from "./queries";
import { useVaultUi } from "./vaultStore";
import t from "../topic/TopicPage.module.css";
import s from "./Vault.module.css";

// CodeMirror is only needed once you start writing, so it loads then.
const LivePreviewEditor = lazy(() => import("../topic/livePreview/LivePreviewEditor").then((m) => ({ default: m.LivePreviewEditor })));

/** The note's name as the page heading, editable in place: Enter renames, Esc cancels. A new note starts with it selected. */
function NoteTitle({ note }: { readonly note: VaultNote }) {
  const rename = useRenameNote(note.id);
  const [draft, setDraft] = useState(note.title);
  const field = useRef<HTMLTextAreaElement>(null);
  const fresh = useVaultUi((st) => st.freshNoteId === note.id);
  const { active, tabId } = useTab();
  const editing = useNoteMode(tabId) === "editing";
  const setMode = useNoteModes((st) => st.setMode);
  const problem = draft === note.title ? null : nameProblem(draft);

  useEffect(() => setDraft(note.title), [note.title]);

  useEffect(() => {
    if (!fresh || !active) return;
    useVaultUi.getState().setFreshNote(null);
    requestAnimationFrame(() => {
      field.current?.focus();
      field.current?.select();
    });
  }, [fresh, active]);

  const commit = () => {
    const title = normalizeName(draft);
    if (!title || title === note.title || nameProblem(title)) {
      setDraft(note.title);
      return;
    }
    rename.mutate(title, { onError: () => setDraft(note.title) });
  };

  return (
    <>
      <h1 className={t.inlineTitle}>
        <textarea
          ref={field}
          id={`title-${tabId}`}
          className={t.titleInput}
          rows={1}
          value={draft}
          spellCheck={false}
          aria-label="Note title (edit to rename)"
          aria-invalid={!!problem}
          onChange={(e) => setDraft(e.target.value.replace(/\n/g, ""))}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              // Like a notes app: Enter in the title moves on to writing (a new editor takes focus itself).
              e.currentTarget.blur();
              if (editing) document.getElementById(`panel-${tabId}`)?.querySelector<HTMLElement>(".cm-content")?.focus();
              else setMode(tabId, "editing");
            } else if (e.key === "Escape") {
              e.preventDefault();
              const el = e.currentTarget;
              setDraft(note.title);
              requestAnimationFrame(() => el.blur());
            }
          }}
        />
      </h1>
      {(problem || rename.error) && (
        <p className={`${t.titleHint} ${t.error}`} role="alert">
          {problem ?? userMessageOf(rename.error)}
        </p>
      )}
    </>
  );
}

/** Where the note lives and where it came from, under the title. */
function NoteMeta({ note }: { readonly note: VaultNote }) {
  const vault = useVault();
  const path = folderPath(note.folderId, vault.data?.folders ?? []);
  return (
    <p className={s.noteMeta}>
      <span className={s.metaItem}>
        <Folder size={13} aria-hidden /> {path.length ? path.join(" / ") : "Notes"}
      </span>
      {note.source && (
        <span className={s.metaItem}>
          <FileUp size={13} aria-hidden /> Imported from {note.source}
        </span>
      )}
      <span className={s.metaItem}>edited {relativeDays(note.updatedAt)}</span>
    </p>
  );
}

function NoteBody({ note }: { readonly note: VaultNote }) {
  const { tabId } = useTab();
  const mode = useNoteMode(tabId);
  const setMode = useNoteModes((st) => st.setMode);
  const save = useSaveVaultNote(note.id);
  const targets = useLinkTargets();
  const openLink = useOpenLink();
  const { mutate, mutateAsync } = save;
  const onSave = useCallback((text: string) => mutateAsync(text), [mutateAsync]);
  const body = note.body;
  const onToggleTask = useCallback(
    (line: number) => {
      const next = toggleTask(body, line);
      if (next !== body) mutate(next);
    },
    [body, mutate],
  );
  const doneEditing = () => setMode(tabId, "reading");
  // A note just created gets its title selected; the editor shouldn't take focus from it.
  const [autoFocus] = useState(() => useVaultUi.getState().freshNoteId !== note.id);

  return (
    <section className={s.noteBody} aria-label="Note" data-outline="notes">
      {save.isError && (
        <p className={t.error} role="alert">
          Not saved: {userMessageOf(save.error)}{" "}
          <button type="button" className={t.inlineLink} onClick={() => mutate(body)}>
            Retry
          </button>
        </p>
      )}
      {mode === "editing" ? (
        <ErrorBoundary
          fallback={() => (
            <p className={t.error} role="alert">
              The editor hit a problem; your saved note is unchanged.{" "}
              <button type="button" className={t.inlineLink} onClick={doneEditing}>
                Back to reading view
              </button>
            </p>
          )}
        >
          <Suspense fallback={<p className={t.muted}>Opening the editor…</p>}>
            <LivePreviewEditor
              initial={body}
              external={body}
              topics={targets}
              onSave={onSave}
              onDone={doneEditing}
              onOpenTopic={openLink}
              label={`${note.title}, in markdown`}
              autoFocus={autoFocus}
            />
          </Suspense>
        </ErrorBoundary>
      ) : body.trim() === "" ? (
        <button type="button" className={t.emptyNote} onClick={() => setMode(tabId, "editing")}>
          Nothing written yet. Click to start writing; type [[ to link a topic or another note.
        </button>
      ) : (
        <MarkdownView body={body} topics={targets} onOpenTopic={openLink} onToggleTask={onToggleTask} />
      )}
    </section>
  );
}

/** One of your own notes: inline title, where it lives, and its markdown (read or edit with Ctrl+E). */
export function NotePage({ noteId }: { readonly noteId: string }) {
  const note = useVaultNote(noteId);
  if (note.isPending) return <p className={t.loading}>Opening note…</p>;
  if (note.error || !note.data) {
    return (
      <div className={t.page}>
        <EmptyState title="Couldn't open this note">{userMessageOf(note.error)}</EmptyState>
      </div>
    );
  }
  return (
    <article className={t.page} aria-label={note.data.title}>
      <NoteTitle note={note.data} />
      <NoteMeta note={note.data} />
      <NoteBody note={note.data} />
    </article>
  );
}
