import { useEffect } from "react";
import { SourceDrawer } from "../source/SourceDrawer";
import { useBindVaultActions } from "../vault/actions";
import { VaultDialogs } from "../vault/VaultDialogs";
import { vaultDialogOpen } from "../vault/vaultStore";
import { CommandPalette } from "./CommandPalette";
import { commandForKey, isTypingTarget, runCommand } from "./commands";
import { LeftSidebar } from "./LeftSidebar";
import { ContextMenuHost } from "./menu/ContextMenu";
import { useMenu } from "./menu/menuStore";
import { Notices } from "./notices";
import { Panes } from "./Panes";
import { QuickSwitcher } from "./QuickSwitcher";
import { Ribbon } from "./Ribbon";
import { RightSidebar } from "./RightSidebar";
import { ShortcutsDialog } from "./ShortcutsDialog";
import { StatusBar } from "./StatusBar";
import { usePruneVanishedTopics } from "./usePruneVanishedTopics";
import { useWorkspace } from "./workspaceStore";
import s from "./Workspace.module.css";

const REPEATABLE: ReadonlySet<string> = new Set(["tab:next", "tab:prev", "nav:back", "nav:forward"]);

/**
 * The app frame: icon ribbon, left sidebar (topics/notes/search/bookmarks), side-by-side
 * panes of tabs, right sidebar (connections, local graph, outline), status bar.
 * Every hotkey is a command in `commands.ts`, also reachable from the palette (Ctrl+P).
 */
export function Workspace() {
  const leftOpen = useWorkspace((st) => st.leftOpen);
  const rightOpen = useWorkspace((st) => st.rightOpen);
  usePruneVanishedTopics();
  useBindVaultActions();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return;
      const command = commandForKey(e, isTypingTarget(e.target));
      if (!command) return;
      e.preventDefault();
      // A dialog or menu owns the keyboard; don't change the workspace behind it.
      const st = useWorkspace.getState();
      if (st.switcherOpen || st.paletteOpen || st.shortcutsOpen || useMenu.getState().menu || vaultDialogOpen()) return;
      // Holding a key repeats only harmless steps (cycling tabs, back/forward), never Ctrl+W or Ctrl+T.
      if (e.repeat && !REPEATABLE.has(command.id)) return;
      runCommand(command);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const columns = [
    "var(--ribbon-width)",
    leftOpen ? "var(--sidebar-width)" : null,
    "minmax(0, 1fr)",
    rightOpen ? "var(--right-width)" : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={s.workspace} style={{ gridTemplateColumns: columns }}>
      <a href="#workspace-main" className={s.skip}>
        Skip to content
      </a>
      <Ribbon />
      {leftOpen && <LeftSidebar />}
      <main id="workspace-main" className={s.main} tabIndex={-1}>
        <Panes />
        <StatusBar />
      </main>
      {rightOpen && <RightSidebar />}
      <QuickSwitcher />
      <CommandPalette />
      <ShortcutsDialog />
      <VaultDialogs />
      <ContextMenuHost />
      <Notices />
      <SourceDrawer />
    </div>
  );
}
