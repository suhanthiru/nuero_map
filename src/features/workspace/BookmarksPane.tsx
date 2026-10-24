import { StateGlyph } from "../../shared/ui/StateGlyph";
import { menuTrigger, topicMenu, viewBookmarkMenu } from "./menu/menus";
import { bookmarkKey } from "./model/bookmarks";
import type { View } from "./model/tabs";
import { useOpen } from "./useOpen";
import { noteMenu } from "../vault/vaultMenus";
import { useNoteIndex, useVault } from "../vault/queries";
import { useTopicIndex, useViewTitle, viewIcon } from "./viewMeta";
import { useWorkspace } from "./workspaceStore";
import s from "./Workspace.module.css";

/** Bookmarked topics and screens, newest first. Right-click (or Shift+F10) to remove. */
export function BookmarksPane() {
  const bookmarks = useWorkspace((st) => st.bookmarks);
  const topics = useTopicIndex();
  const notes = useNoteIndex();
  const notesLoaded = useVault().isSuccess;
  const titleOf = useViewTitle();
  const { open } = useOpen();
  // A bookmarked topic that was merged away (or a deleted note) has nothing to open.
  const shown = bookmarks.filter(
    (b) => (b.kind !== "topic" || topics.size === 0 || topics.has(b.topicId)) && (b.kind !== "note" || !notesLoaded || notes.has(b.noteId)),
  );

  const row = (view: View) => {
    const topic = view.kind === "topic" ? topics.get(view.topicId) : undefined;
    const note = view.kind === "note" ? notes.get(view.noteId) : undefined;
    const title = titleOf(view);
    const Icon = viewIcon(view);
    const menu = menuTrigger(`Bookmark: ${title}`, () => (topic ? topicMenu(topic) : note ? noteMenu(note) : viewBookmarkMenu(view)));
    return (
      <li key={bookmarkKey(view)}>
        <button type="button" className={s.treeItem} onClick={(e) => open(view, e)} onAuxClick={(e) => open(view, e)} {...menu}>
          {topic ? <StateGlyph state={topic.state} size={10} /> : <Icon size={14} strokeWidth={1.75} aria-hidden />}
          <span className={s.treeTitle}>{title}</span>
        </button>
      </li>
    );
  };

  return (
    <div className={s.pane}>
      <div className={s.paneHeader}>
        <span>Bookmarks</span>
        {shown.length > 0 && <span className={s.folderCount}>{shown.length}</span>}
      </div>
      {shown.length === 0 && (
        <p className={s.paneEmpty}>No bookmarks yet. Right-click a topic, a note or a tab, or use More options (⋮), and choose Bookmark.</p>
      )}
      <ul className={s.tree} aria-label="Bookmarks">
        {shown.map(row)}
      </ul>
    </div>
  );
}
