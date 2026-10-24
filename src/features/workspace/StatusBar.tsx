import { isTauri } from "../../api/transport";
import { formatTime } from "../../shared/format/dates";
import { runningPipelines, useJobStore } from "../import/jobStore";
import { useCaptureEvents, useCaptureStore } from "../import/useCaptureEvents";
import { useJobEvents } from "../import/useJobEvents";
import { pipelineLabel } from "../import/model/stages";
import { countChars, countWords } from "../topic/model/note";
import { useTopicNote, useTopicPage } from "../topic/queries";
import { useVaultNote } from "../vault/queries";
import { activeTab, currentView } from "./model/tabs";
import { useAllTopics } from "./viewMeta";
import { useWorkspace } from "./workspaceStore";
import s from "./Workspace.module.css";

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

/** For the focused topic: its backlinks (opens the Connections pane) and the size of your note. */
function TopicStatus({ topicId }: { readonly topicId: string }) {
  const page = useTopicPage(topicId);
  const note = useTopicNote(topicId);
  const setRightPane = useWorkspace((st) => st.setRightPane);
  const links = page.data?.connections.length;
  const body = note.data?.body ?? "";
  return (
    <>
      {links !== undefined && (
        <button type="button" className={s.statusButton} onClick={() => setRightPane("connections")} title="Show connections">
          {plural(links, "backlink")}
        </button>
      )}
      {note.data && (
        <span className={s.statusItem}>
          {plural(countWords(body), "word")} · {plural(countChars(body), "character")}
        </span>
      )}
    </>
  );
}

/** When the browser extension last sent a Gemini turn. Quiet: the first one is also a toast. */
function LastCapture() {
  const at = useCaptureStore((st) => st.lastCaptureAt);
  if (!at) return null;
  return (
    <span className={s.statusItem} title="Last chat captured from Gemini">
      <span className="visually-hidden">Last capture from </span>Gemini · {formatTime(at)}
    </span>
  );
}

/** For the focused note: how long it is. */
function NoteStatus({ noteId }: { readonly noteId: string }) {
  const note = useVaultNote(noteId);
  if (!note.data) return null;
  const body = note.data.body;
  return (
    <span className={s.statusItem}>
      {plural(countWords(body), "word")} · {plural(countChars(body), "character")}
    </span>
  );
}

/** Bottom-right status, like an editor's: the focused note, background work and a topic count. */
export function StatusBar() {
  useJobEvents();
  useCaptureEvents();
  const pipelines = useJobStore((st) => st.pipelines);
  const finished = useJobStore((st) => st.finished);
  const topics = useAllTopics();
  const ws = useWorkspace((st) => st.ws);
  const view = currentView(activeTab(ws));
  const current = runningPipelines(pipelines, finished)[0];
  return (
    <footer className={s.statusBar}>
      {view.kind === "topic" && <TopicStatus topicId={view.topicId} />}
      {view.kind === "note" && <NoteStatus noteId={view.noteId} />}
      {/* Only background work is announced; word counts change on every keystroke. */}
      <span aria-live="polite" className={s.statusLive}>
        {current && (
          <span className={s.statusItem}>
            <span className={s.pulse} aria-hidden />
            {pipelineLabel(current)}
          </span>
        )}
      </span>
      <LastCapture />
      {topics.data && <span className={s.statusItem}>{plural(topics.data.length, "topic")}</span>}
      {!isTauri() && <span className={s.statusItem}>mock data</span>}
    </footer>
  );
}
