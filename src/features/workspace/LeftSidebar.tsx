import { useState } from "react";
import { Bookmark, ChevronsUpDown, CircleHelp, FolderClosed, ListTree, Search, Settings, type LucideIcon } from "lucide-react";
import { useDebounce } from "../../shared/hooks/useDebounce";
import { useSearch } from "../home/queries";
import { NotesExplorer } from "../vault/NotesExplorer";
import { BookmarksPane } from "./BookmarksPane";
import { SEARCH_INPUT_ID } from "./commands";
import { TopicExplorer } from "./TopicExplorer";
import { useOpen } from "./useOpen";
import { useWorkspace, type LeftPane } from "./workspaceStore";
import s from "./Workspace.module.css";

const DEBOUNCE_MS = 150;

function SearchPane() {
  const [query, setQuery] = useState("");
  const results = useSearch(useDebounce(query, DEBOUNCE_MS));
  const { open } = useOpen();
  const hits = query.trim().length >= 2 ? (results.data ?? []) : [];
  return (
    <div className={s.pane}>
      <div className={s.paneHeader}>
        <span>Search</span>
      </div>
      <input
        id={SEARCH_INPUT_ID}
        className={s.paneSearch}
        type="search"
        placeholder="Search topics, ideas and notes…"
        aria-label="Search topics, ideas and notes"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <ul className={s.hits}>
        {hits.map((h) => (
          <li key={`${h.kind}-${h.id}`}>
            <button
              type="button"
              className={s.hit}
              disabled={!h.topicId && !h.noteId}
              onClick={(e) => {
                if (h.noteId) open({ kind: "note", noteId: h.noteId }, e);
                else if (h.topicId) open({ kind: "topic", topicId: h.topicId }, e);
              }}
            >
              <span className={s.hitTitle}>{h.title}</span>
              <span className={s.hitMeta}>
                {h.kind} · {h.snippet}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {query.trim().length >= 2 && results.isSuccess && hits.length === 0 && <p className={s.paneEmpty}>No matches.</p>}
    </div>
  );
}

const PANES: readonly { readonly id: LeftPane; readonly label: string; readonly icon: LucideIcon }[] = [
  { id: "topics", label: "Topics", icon: ListTree },
  { id: "notes", label: "Notes", icon: FolderClosed },
  { id: "search", label: "Search", icon: Search },
  { id: "bookmarks", label: "Bookmarks", icon: Bookmark },
];

/** Bottom of the sidebar, like a vault switcher: the app's name, help and settings. */
function VaultFooter() {
  const setShortcutsOpen = useWorkspace((st) => st.setShortcutsOpen);
  const { open } = useOpen();
  return (
    <div className={s.vaultFooter}>
      <span className={s.vaultName}>
        <ChevronsUpDown size={14} aria-hidden />
        Neural Map
      </span>
      <button type="button" className={s.iconButton} aria-label="Keyboard shortcuts" title="Keyboard shortcuts" onClick={() => setShortcutsOpen(true)}>
        <CircleHelp size={16} aria-hidden />
      </button>
      <button
        type="button"
        className={s.iconButton}
        aria-label="Settings"
        title="Settings"
        onClick={(e) => open({ kind: "settings" }, e)}
        onAuxClick={(e) => open({ kind: "settings" }, e)}
      >
        <Settings size={16} aria-hidden />
      </button>
    </div>
  );
}

export function LeftSidebar() {
  const { leftPane, setLeftPane } = useWorkspace();
  return (
    <aside className={s.leftSidebar} aria-label="Left sidebar">
      <div className={s.paneTabs} role="tablist" aria-label="Left sidebar views">
        {PANES.map((p) => (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={leftPane === p.id}
            className={s.paneTab}
            title={p.label}
            onClick={() => setLeftPane(p.id)}
          >
            <p.icon size={16} strokeWidth={1.75} aria-hidden /> <span className="visually-hidden">{p.label}</span>
          </button>
        ))}
      </div>
      {leftPane === "topics" && <TopicExplorer />}
      {leftPane === "notes" && <NotesExplorer />}
      {leftPane === "search" && <SearchPane />}
      {leftPane === "bookmarks" && <BookmarksPane />}
      <VaultFooter />
    </aside>
  );
}
