import type { MouseEvent } from "react";
import { CalendarDays, FileInput, GitMerge, GraduationCap, PanelLeft, Search, Settings, Terminal, Waypoints, type LucideIcon } from "lucide-react";
import { runCommand } from "./commands";
import type { View } from "./model/tabs";
import { useOpen } from "./useOpen";
import { useWorkspace } from "./workspaceStore";
import s from "./Workspace.module.css";

interface Action {
  readonly label: string;
  readonly icon: LucideIcon;
  readonly view?: View;
  readonly command?: string;
  readonly shortcut?: string;
}

const TOP: readonly Action[] = [
  { label: "Open quick switcher", icon: Search, command: "switcher:open", shortcut: "Ctrl+O" },
  { label: "Open graph view", icon: Waypoints, command: "graph:open", shortcut: "Ctrl+G" },
  { label: "Today", icon: CalendarDays, view: { kind: "today" } },
  { label: "Weekly review", icon: GraduationCap, view: { kind: "review" } },
  { label: "Import a chat export", icon: FileInput, view: { kind: "import" } },
  { label: "Merge suggestions", icon: GitMerge, view: { kind: "merges" } },
  { label: "Open command palette", icon: Terminal, command: "palette:open", shortcut: "Ctrl+P" },
];

/** The narrow icon strip on the far left, topped by the left sidebar toggle. */
export function Ribbon() {
  const { open } = useOpen();
  const leftOpen = useWorkspace((st) => st.leftOpen);
  const toggleLeft = useWorkspace((st) => st.toggleLeft);
  const button = (a: Action) => {
    const label = a.shortcut ? `${a.label} (${a.shortcut})` : a.label;
    const onView = (e: MouseEvent) => a.view && open(a.view, e);
    return (
      <button
        key={a.label}
        type="button"
        className={s.ribbonButton}
        aria-label={label}
        title={label}
        onClick={a.command ? () => runCommand(a.command as string) : onView}
        onAuxClick={a.view ? onView : undefined}
      >
        <a.icon size={18} strokeWidth={1.75} aria-hidden />
      </button>
    );
  };
  return (
    <nav className={s.ribbon} aria-label="Ribbon">
      <div className={s.ribbonTop}>
        <button
          type="button"
          className={s.ribbonButton}
          aria-label="Toggle left sidebar"
          title="Toggle left sidebar"
          aria-pressed={leftOpen}
          onClick={toggleLeft}
        >
          <PanelLeft size={18} strokeWidth={1.75} aria-hidden />
        </button>
      </div>
      <div className={s.ribbonGroup}>{TOP.map(button)}</div>
      {/* With the sidebar open, settings lives in its footer. */}
      {!leftOpen && <div className={`${s.ribbonGroup} ${s.ribbonBottom}`}>{button({ label: "Settings", icon: Settings, view: { kind: "settings" } })}</div>}
    </nav>
  );
}
