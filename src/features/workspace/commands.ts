import { useNoteModes } from "../topic/noteMode";
import { currentFolder, newFolder, newNote } from "../vault/actions";
import { useVaultUi } from "../vault/vaultStore";
import { useExplorer } from "./explorerStore";
import { isBookmarked } from "./model/bookmarks";
import { matchesHotkey, type Hotkey, type KeyLike } from "./model/hotkeys";
import { activePane, allTabs, focusedView } from "./model/panes";
import { notify } from "./notices";
import { currentView, type View } from "./model/tabs";
import { useWorkspace } from "./workspaceStore";

/** One action, reachable from its hotkey, the command palette and menus. */
export interface Command {
  readonly id: string;
  readonly name: string;
  readonly hotkeys?: readonly Hotkey[];
  /** Hotkeys fire inside text fields too unless this is false (e.g. Alt+← moves the caret by word). */
  readonly whileTyping?: boolean;
  readonly isAvailable?: () => boolean;
  readonly run: () => void;
}

export const SEARCH_INPUT_ID = "workspace-search-input";
const RECENT_KEY = "neural-map.commands.recent";
const RECENT_MAX = 8;
const TAB_DIGITS = 8;

const st = () => useWorkspace.getState();
const view = (): View => focusedView(st().layout);
const activeTabId = () => st().ws.activeId;
const onTopic = () => view().kind === "topic";
const onNote = () => view().kind === "note";
const vaultUi = () => useVaultUi.getState();

/** The focused note, as an explorer item. Only call when `onNote()`. */
function currentNoteItem() {
  const v = view();
  return { kind: "note", id: v.kind === "note" ? v.noteId : "" } as const;
}
const activePinned = () => !!st().ws.tabs.find((t) => t.id === activeTabId())?.pinned;

/** Ctrl+W and menu Close: a pinned tab stays, and says why. */
export function closeOrExplain(tabId: string): void {
  const pinned = st().layout.panes.some((p) => p.ws.tabs.some((t) => t.id === tabId && t.pinned));
  if (pinned) notify("Unpin the tab to close it");
  else st().close(tabId);
}

function openGraph(): void {
  const graph = allTabs(st().layout).find((t) => currentView(t).kind === "graph");
  if (graph) st().activate(graph.id);
  else st().open({ kind: "graph" }, { newTab: true });
}

function goToTab(index: number | "last"): void {
  const tabs = activePane(st().layout).ws.tabs;
  const tab = index === "last" ? tabs[tabs.length - 1] : tabs[index];
  if (tab) st().activate(tab.id);
}

/** Focus lands after React has shown the pane. */
function focusSoon(id: string): void {
  requestAnimationFrame(() => document.getElementById(id)?.focus());
}

const openScreen = (id: string, name: string, target: View, hotkeys?: readonly Hotkey[]): Command => ({
  id,
  name,
  hotkeys,
  run: () => st().open(target),
});

const tabJumps: Command[] = Array.from({ length: TAB_DIGITS }, (_, i) => ({
  id: `tab:go-${i + 1}`,
  name: `Go to tab ${i + 1}`,
  hotkeys: [{ key: String(i + 1), mod: true }],
  run: () => goToTab(i),
}));

export const COMMANDS: readonly Command[] = [
  { id: "switcher:open", name: "Open quick switcher", hotkeys: [{ key: "o", mod: true }], run: () => st().setSwitcherOpen(true) },
  { id: "palette:open", name: "Open command palette", hotkeys: [{ key: "p", mod: true }], run: () => st().setPaletteOpen(true) },
  { id: "graph:open", name: "Open graph view", hotkeys: [{ key: "g", mod: true }], run: openGraph },
  openScreen("today:open", "Open Today", { kind: "today" }),
  openScreen("review:open", "Open weekly review", { kind: "review" }),
  openScreen("import:open", "Import a chat export", { kind: "import" }),
  openScreen("merges:open", "Open merge suggestions", { kind: "merges" }),
  openScreen("settings:open", "Open settings", { kind: "settings" }, [{ key: ",", mod: true }]),
  {
    id: "search:open",
    name: "Search topics and ideas",
    hotkeys: [{ key: "f", mod: true, shift: true }],
    run: () => {
      st().setLeftPane("search");
      focusSoon(SEARCH_INPUT_ID);
    },
  },
  { id: "note:new", name: "Create new note", hotkeys: [{ key: "n", mod: true }], run: () => void newNote() },
  { id: "folder:new", name: "Create new folder", run: () => void newFolder() },
  {
    id: "vault:import",
    name: "Import Word, Google Docs or Markdown files",
    run: () => vaultUi().setImportInto({ folderId: currentFolder() }),
  },
  { id: "explorer:notes", name: "Show notes and folders", run: () => st().setLeftPane("notes") },
  { id: "tab:new", name: "New tab", hotkeys: [{ key: "t", mod: true }], run: () => st().open({ kind: "today" }, { newTab: true }) },
  { id: "tab:close", name: "Close current tab", hotkeys: [{ key: "w", mod: true }], run: () => closeOrExplain(activeTabId()) },
  {
    id: "tab:toggle-pin",
    name: "Pin / unpin current tab",
    run: () => {
      const wasPinned = activePinned();
      st().togglePin(activeTabId());
      notify(wasPinned ? "Tab unpinned" : "Tab pinned");
    },
  },
  {
    id: "tab:close-others",
    name: "Close other tabs in this pane",
    // Pinned tabs stay, so there's only something to do while another unpinned tab exists.
    isAvailable: () => st().ws.tabs.some((t) => t.id !== activeTabId() && !t.pinned),
    run: () => st().closeOthers(activeTabId()),
  },
  { id: "tab:next", name: "Go to next tab", hotkeys: [{ key: "Tab", mod: true }], run: () => st().cycle(1) },
  { id: "tab:prev", name: "Go to previous tab", hotkeys: [{ key: "Tab", mod: true, shift: true }], run: () => st().cycle(-1) },
  ...tabJumps,
  { id: "tab:go-last", name: "Go to last tab", hotkeys: [{ key: "9", mod: true }], run: () => goToTab("last") },
  {
    id: "nav:back",
    name: "Navigate back",
    hotkeys: [{ key: "ArrowLeft", alt: true }],
    whileTyping: false,
    isAvailable: () => {
      const tab = st().ws.tabs.find((t) => t.id === activeTabId());
      return !!tab && tab.index > 0;
    },
    run: () => st().back(activeTabId()),
  },
  {
    id: "nav:forward",
    name: "Navigate forward",
    hotkeys: [{ key: "ArrowRight", alt: true }],
    whileTyping: false,
    isAvailable: () => {
      const tab = st().ws.tabs.find((t) => t.id === activeTabId());
      return !!tab && tab.index < tab.history.length - 1;
    },
    run: () => st().forward(activeTabId()),
  },
  { id: "pane:split-right", name: "Split right", hotkeys: [{ key: "\\", mod: true }], run: () => st().splitRight() },
  { id: "sidebar:toggle-left", name: "Toggle left sidebar", run: () => st().toggleLeft() },
  { id: "sidebar:toggle-right", name: "Toggle right sidebar", run: () => st().toggleRight() },
  {
    id: "note:toggle-mode",
    name: "Toggle reading and editing view",
    hotkeys: [{ key: "e", mod: true }],
    isAvailable: () => onTopic() || onNote(),
    run: () => useNoteModes.getState().toggle(activeTabId()),
  },
  {
    id: "bookmark:add",
    name: "Bookmark current view",
    isAvailable: () => !isBookmarked(st().bookmarks, view()),
    run: () => st().toggleBookmark(view()),
  },
  {
    id: "bookmark:remove",
    name: "Remove bookmark for current view",
    isAvailable: () => isBookmarked(st().bookmarks, view()),
    run: () => st().removeBookmark(view()),
  },
  {
    id: "explorer:reveal",
    name: "Reveal active topic in the explorer",
    isAvailable: onTopic,
    run: () => {
      st().setLeftPane("topics");
      useExplorer.getState().requestReveal();
    },
  },
  {
    id: "note:reveal",
    name: "Reveal active note in the explorer",
    isAvailable: onNote,
    run: () => {
      st().setLeftPane("notes");
      vaultUi().requestReveal();
    },
  },
  {
    id: "note:rename",
    name: "Rename current note",
    isAvailable: onNote,
    run: () => focusSoon(`title-${activeTabId()}`),
  },
  { id: "note:move", name: "Move current note to another folder", isAvailable: onNote, run: () => vaultUi().setMoving(currentNoteItem()) },
  { id: "note:delete", name: "Delete current note", isAvailable: onNote, run: () => vaultUi().setDeleting(currentNoteItem()) },
  { id: "sidebar:connections", name: "Show connections", isAvailable: onTopic, run: () => st().setRightPane("connections") },
  { id: "sidebar:local-graph", name: "Open local graph", isAvailable: onTopic, run: () => st().setRightPane("local-graph") },
  { id: "sidebar:outline", name: "Show outline", isAvailable: () => onTopic() || onNote(), run: () => st().setRightPane("outline") },
  { id: "shortcuts:show", name: "Show keyboard shortcuts", hotkeys: [{ key: "/", mod: true }], run: () => st().setShortcutsOpen(true) },
];

const BY_ID = new Map(COMMANDS.map((c) => [c.id, c]));

export function isAvailable(c: Command): boolean {
  return c.isAvailable?.() ?? true;
}

export function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

/** The command a key press triggers. Unavailable commands still claim their key, so it does nothing. */
export function commandForKey(e: KeyLike, typing: boolean, commands: readonly Command[] = COMMANDS): Command | undefined {
  return commands.find((c) => (!typing || c.whileTyping !== false) && c.hotkeys?.some((h) => matchesHotkey(e, h)));
}

export function recentCommandIds(): string[] {
  try {
    const raw = JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? "[]") as unknown;
    return Array.isArray(raw) ? raw.filter((id): id is string => typeof id === "string" && BY_ID.has(id)) : [];
  } catch {
    return [];
  }
}

/** The palette floats what you picked there recently (hotkey use doesn't count). */
export function recordCommandUse(id: string): void {
  try {
    const next = [id, ...recentCommandIds().filter((r) => r !== id)].slice(0, RECENT_MAX);
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable: the palette just won't float recent commands.
  }
}

/** Runs a command if it's available right now. Returns whether it ran. */
export function runCommand(idOrCommand: string | Command): boolean {
  const command = typeof idOrCommand === "string" ? BY_ID.get(idOrCommand) : idOrCommand;
  if (!command || !isAvailable(command)) return false;
  command.run();
  return true;
}
