import { Link2, ListTree, Waypoints } from "lucide-react";
import { StateGlyph } from "../../shared/ui/StateGlyph";
import { LocalGraph } from "../graph/LocalGraph";
import { EDGE_KIND_LABEL } from "../graph/model/describe";
import { noteOutline, topicOutline, type OutlineItem } from "../topic/model/outline";
import { useNoteMode } from "../topic/noteMode";
import { useTopicNote, useTopicPage } from "../topic/queries";
import { useVaultNote } from "../vault/queries";
import { focusedTab, sidebarTopicTab } from "./model/panes";
import { currentView } from "./model/tabs";
import { useOpen } from "./useOpen";
import { useWorkspace, type RightPane } from "./workspaceStore";
import s from "./Workspace.module.css";

/**
 * Topic page sections carry `data-outline="<section>"`; the outline scrolls to the one in
 * the focused pane's tab (the same topic can be open in several tabs and panes).
 */
function jumpTo(tabId: string, section: string): void {
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const panel = document.getElementById(`panel-${tabId}`);
  const el = panel?.querySelector<HTMLElement>(`[data-outline="${section}"]`);
  el?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
}

function ConnectionsPane({ topicId }: { readonly topicId: string }) {
  const page = useTopicPage(topicId);
  const { openTopic } = useOpen();
  const links = [...(page.data?.connections ?? [])].sort((a, b) => b.edge.strength - a.edge.strength);
  return (
    <div className={s.pane}>
      <div className={s.paneHeader}>
        <span>Connections</span>
        <span className={s.folderCount}>{links.length}</span>
      </div>
      {links.length === 0 && <p className={s.paneEmpty}>No connections yet.</p>}
      <ul className={s.linkList}>
        {links.map((c) => (
          <li key={c.edge.id}>
            <button type="button" className={s.linkItem} onClick={(e) => openTopic(c.topic.id, e)} onAuxClick={(e) => openTopic(c.topic.id, e)}>
              <span className={s.linkTitle}>
                <StateGlyph state={c.topic.state} size={10} /> {c.topic.title}
              </span>
              <span className={s.hitMeta}>
                {EDGE_KIND_LABEL[c.edge.kind]} · {c.edge.evidenceCount} excerpts
              </span>
              {c.evidence[0] && <span className={s.linkQuote}>“{c.evidence[0].text}”</span>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TopicOutline({ topicId, tabId }: { readonly topicId: string; readonly tabId: string }) {
  const page = useTopicPage(topicId);
  const note = useTopicNote(topicId);
  return <OutlineList items={topicOutline(page.data?.ideas ?? [], note.data?.body ?? "")} tabId={tabId} />;
}

/** Headings jump to their place in reading view; while editing, the outline just lists them. */
function NoteOutline({ noteId, tabId }: { readonly noteId: string; readonly tabId: string }) {
  const note = useVaultNote(noteId);
  const items = noteOutline(note.data?.body ?? "");
  const editing = useNoteMode(tabId) === "editing";
  if (note.data && items.length === 0) {
    return (
      <div className={s.pane}>
        <div className={s.paneHeader}>
          <span>Outline</span>
        </div>
        <p className={s.paneEmpty}>No headings yet. Start a line with # to add one.</p>
      </div>
    );
  }
  return <OutlineList items={items} tabId={tabId} disabled={editing} />;
}

function OutlineList({ items, tabId, disabled }: { readonly items: readonly OutlineItem[]; readonly tabId: string; readonly disabled?: boolean }) {
  return (
    <div className={s.pane}>
      <div className={s.paneHeader}>
        <span>Outline</span>
      </div>
      <ul className={s.outline}>
        {items.map((it) => (
          <li key={it.section}>
            <button
              type="button"
              className={s.outlineItem}
              style={{ paddingLeft: `${8 + it.depth * 14}px` }}
              disabled={disabled}
              title={disabled ? "Switch to reading view (Ctrl+E) to jump to a heading" : undefined}
              onClick={() => jumpTo(tabId, it.section)}
            >
              {it.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

const PANES: readonly { id: RightPane; label: string; icon: typeof Link2 }[] = [
  { id: "connections", label: "Connections", icon: Link2 },
  { id: "local-graph", label: "Local graph", icon: Waypoints },
  { id: "outline", label: "Outline", icon: ListTree },
];

export function RightSidebar() {
  const { layout, rightPane, setRightPane } = useWorkspace();
  const focused = focusedTab(layout);
  const focusedView = currentView(focused);
  const noteId = focusedView.kind === "note" ? focusedView.noteId : null;
  const tab = noteId ? null : sidebarTopicTab(layout);
  const view = tab ? currentView(tab) : null;
  const topicId = view?.kind === "topic" ? view.topicId : null;
  return (
    <aside className={s.rightSidebar} aria-label="Right sidebar">
      <div className={s.paneTabs} role="tablist" aria-label="Right sidebar views">
        {PANES.map((p) => (
          <button key={p.id} type="button" role="tab" aria-selected={rightPane === p.id} className={s.paneTab} title={p.label} onClick={() => setRightPane(p.id)}>
            <p.icon size={15} aria-hidden /> <span className="visually-hidden">{p.label}</span>
          </button>
        ))}
      </div>
      {!topicId && !noteId && <p className={s.paneEmpty}>Open a topic to see its connections, local graph and outline here.</p>}
      {noteId && rightPane === "outline" && <NoteOutline noteId={noteId} tabId={focused.id} />}
      {noteId && rightPane !== "outline" && <p className={s.paneEmpty}>Connections and the local graph are for topics. This note's headings are under Outline.</p>}
      {topicId && rightPane === "connections" && <ConnectionsPane topicId={topicId} />}
      {topicId && rightPane === "local-graph" && <LocalGraph topicId={topicId} />}
      {topicId && tab && rightPane === "outline" && <TopicOutline topicId={topicId} tabId={tab.id} />}
    </aside>
  );
}
