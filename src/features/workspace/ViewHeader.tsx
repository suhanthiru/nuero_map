import { useRef } from "react";
import { BookOpen, ChevronLeft, ChevronRight, MoreVertical, Pencil } from "lucide-react";
import { useNoteMode, useNoteModes } from "../topic/noteMode";
import { openMenuAt, viewMenu } from "./menu/menus";
import { useMenu } from "./menu/menuStore";
import type { Pane } from "./model/panes";
import { activeTab, currentView } from "./model/tabs";
import { folderPath } from "../vault/model/tree";
import { useVault } from "../vault/queries";
import { useTopicIndex, useViewTitle } from "./viewMeta";
import { useWorkspace } from "./workspaceStore";
import s from "./Workspace.module.css";

/** Reading view renders the note; editing view shows its markdown. Like a notes app, the icon shows where it takes you. */
function NoteModeToggle({ tabId }: { readonly tabId: string }) {
  const mode = useNoteMode(tabId);
  const toggle = useNoteModes((st) => st.toggle);
  const label = mode === "editing" ? "Switch to reading view" : "Switch to editing view";
  const Icon = mode === "editing" ? BookOpen : Pencil;
  return (
    <button type="button" className={s.iconButton} aria-label={`${label} (Ctrl+E)`} title={`${label} (Ctrl+E)`} onClick={() => toggle(tabId)}>
      <Icon size={16} aria-hidden />
    </button>
  );
}

/** Back/forward for the pane's tab, its title, and the view actions. */
export function ViewHeader({ pane }: { readonly pane: Pane }) {
  const back = useWorkspace((st) => st.back);
  const forward = useWorkspace((st) => st.forward);
  const topics = useTopicIndex();
  const vault = useVault();
  const titleOf = useViewTitle();
  const more = useRef<HTMLButtonElement>(null);
  const menuOpen = useMenu((st) => !!st.menu && st.menu.trigger === more.current);
  const tab = activeTab(pane.ws);
  const view = currentView(tab);
  const topicCrumb = view.kind === "topic" ? topics.get(view.topicId)?.state : undefined;
  const note = view.kind === "note" ? vault.data?.notes.find((n) => n.id === view.noteId) : undefined;
  const noteCrumb = note && vault.data ? folderPath(note.folderId, vault.data.folders).join(" / ") : undefined;
  const crumbs = topicCrumb ?? noteCrumb;
  const title = titleOf(view);
  return (
    <div className={s.viewHeader}>
      <button type="button" className={s.iconButton} aria-label="Back (Alt+Left)" disabled={tab.index === 0} onClick={() => back(tab.id)}>
        <ChevronLeft size={16} aria-hidden />
      </button>
      <button
        type="button"
        className={s.iconButton}
        aria-label="Forward (Alt+Right)"
        disabled={tab.index >= tab.history.length - 1}
        onClick={() => forward(tab.id)}
      >
        <ChevronRight size={16} aria-hidden />
      </button>
      <div className={s.viewTitle}>
        {crumbs && <span className={s.viewCrumb}>{crumbs} /</span>}
        <span className={s.viewTitleText}>{title}</span>
      </div>
      <div className={s.viewActions}>
        {(view.kind === "topic" || view.kind === "note") && <NoteModeToggle tabId={tab.id} />}
        <button
          ref={more}
          type="button"
          className={s.iconButton}
          aria-label="More options"
          title="More options"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={(e) => {
            if (menuOpen) useMenu.getState().closeMenu(false);
            else openMenuAt(e.currentTarget, "More options", viewMenu(tab.id, title), { toggles: true, alignEnd: true });
          }}
        >
          <MoreVertical size={16} aria-hidden />
        </button>
      </div>
    </div>
  );
}
