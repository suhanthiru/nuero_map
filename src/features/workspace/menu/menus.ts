import type { KeyboardEvent, MouseEvent } from "react";
import { Bookmark, BookmarkMinus, Columns2, Copy, FolderInput, ListTree, Orbit, Pin, PinOff, SquarePlus, Trash, Waypoints, X } from "lucide-react";
import type { TopicSummary } from "../../../api/contract";
import { copyText } from "../../../shared/excerpt/CopyButton";
import { useVaultUi } from "../../vault/vaultStore";
import { useExplorer } from "../explorerStore";
import { isBookmarked } from "../model/bookmarks";
import { paneOfTab } from "../model/panes";
import { currentView, type View } from "../model/tabs";
import { notify } from "../notices";
import { useWorkspace } from "../workspaceStore";
import { entries, useMenu, type MenuEntry } from "./menuStore";

const st = () => useWorkspace.getState();

/** Shift+F10 and the Menu key open the focused element's menu, as on any desktop app. */
export function isMenuKey(e: KeyboardEvent): boolean {
  return e.key === "ContextMenu" || (e.shiftKey && e.key === "F10");
}

export interface OpenAt {
  /** Open at the pointer instead of below the trigger. */
  readonly point?: { readonly x: number; readonly y: number };
  /** The trigger is a button that toggles the menu. */
  readonly toggles?: boolean;
  /** Line the menu's right edge up with the trigger's (for buttons at the right of a bar). */
  readonly alignEnd?: boolean;
}

/** Opens below `trigger`, or at the pointer when one is given. */
export function openMenuAt(trigger: HTMLElement, label: string, list: readonly MenuEntry[], at: OpenAt = {}): void {
  const rect = trigger.getBoundingClientRect();
  const x = at.point?.x ?? (at.alignEnd ? rect.right : rect.left);
  const y = at.point?.y ?? rect.bottom + 2;
  useMenu.getState().openMenu({ label, entries: list, x, y, trigger, toggles: at.toggles, alignEnd: !at.point && at.alignEnd });
}

/** Props that give an element a right-click / keyboard context menu. */
export function menuTrigger(label: string, build: () => readonly MenuEntry[]) {
  return {
    onContextMenu: (e: MouseEvent<HTMLElement>) => {
      e.preventDefault();
      e.stopPropagation();
      // A keyboard-opened contextmenu event has button 0 and belongs at the element.
      openMenuAt(e.currentTarget, label, build(), e.button === 2 ? { point: { x: e.clientX, y: e.clientY } } : {});
    },
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      if (!isMenuKey(e)) return;
      e.preventDefault();
      e.stopPropagation();
      openMenuAt(e.currentTarget, label, build());
    },
  };
}

export function copyEntry(title: string, label = "Copy title"): MenuEntry {
  return {
    id: "copy-title",
    label,
    icon: Copy,
    run: () => {
      copyText(title).then(
        () => notify("Copied title"),
        () => notify("Couldn't copy the title"),
      );
    },
  };
}

export function bookmarkEntry(view: View): MenuEntry {
  const marked = isBookmarked(st().bookmarks, view);
  return marked
    ? { id: "bookmark", label: "Remove bookmark", icon: BookmarkMinus, run: () => st().removeBookmark(view) }
    : { id: "bookmark", label: "Bookmark", icon: Bookmark, run: () => st().toggleBookmark(view) };
}

function revealTopic(): void {
  st().setLeftPane("topics");
  useExplorer.getState().requestReveal();
}

function revealNote(): void {
  st().setLeftPane("notes");
  useVaultUi.getState().requestReveal();
}

export const SEP = (id: string): MenuEntry => ({ kind: "separator", id });

/** Explorer rows and bookmarks: one topic. */
export function topicMenu(topic: TopicSummary): MenuEntry[] {
  const view: View = { kind: "topic", topicId: topic.id };
  return [
    { id: "new-tab", label: "Open in new tab", icon: SquarePlus, run: () => st().open(view, { newTab: true }) },
    { id: "to-right", label: "Open to the right", icon: Columns2, run: () => st().open(view, { toRight: true }) },
    SEP("s1"),
    bookmarkEntry(view),
    { id: "graph", label: "Show on graph", icon: Waypoints, run: () => st().open({ kind: "graph", focusTopicId: topic.id }) },
    copyEntry(topic.title),
  ];
}

/** Bookmarked screens that aren't topics. */
export function viewBookmarkMenu(view: View): MenuEntry[] {
  return [
    { id: "new-tab", label: "Open in new tab", icon: SquarePlus, run: () => st().open(view, { newTab: true }) },
    { id: "to-right", label: "Open to the right", icon: Columns2, run: () => st().open(view, { toRight: true }) },
    SEP("s1"),
    { id: "remove", label: "Remove bookmark", icon: BookmarkMinus, run: () => st().removeBookmark(view) },
  ];
}

function tabContext(tabId: string) {
  const pane = paneOfTab(st().layout, tabId);
  const tab = pane?.ws.tabs.find((t) => t.id === tabId);
  return { pane, view: tab ? currentView(tab) : undefined, pinned: !!tab?.pinned };
}

function pinEntry(tabId: string, pinned: boolean): MenuEntry {
  return pinned
    ? { id: "pin", label: "Unpin", icon: PinOff, run: () => st().togglePin(tabId) }
    : { id: "pin", label: "Pin", icon: Pin, run: () => st().togglePin(tabId) };
}

/** Right-click on a tab. */
export function tabMenu(tabId: string, title: string): MenuEntry[] {
  const { pane, view, pinned } = tabContext(tabId);
  if (!pane || !view) return [];
  const at = pane.ws.tabs.findIndex((t) => t.id === tabId);
  const closable = (from: number) => pane.ws.tabs.some((t, i) => i > from && t.id !== tabId && !t.pinned);
  return entries(
    { id: "close", label: "Close", icon: X, hint: "Ctrl+W", disabled: pinned, run: () => st().close(tabId) },
    { id: "close-others", label: "Close others", disabled: !pane.ws.tabs.some((t) => t.id !== tabId && !t.pinned), run: () => st().closeOthers(tabId) },
    { id: "close-right", label: "Close tabs to the right", disabled: !closable(at), run: () => st().closeToRight(tabId) },
    SEP("s1"),
    pinEntry(tabId, pinned),
    { id: "split", label: "Split right", icon: Columns2, run: () => st().splitRight(tabId) },
    bookmarkEntry(view),
    copyEntry(title),
  );
}

/** The ⋮ More options button in a view header. */
export function viewMenu(tabId: string, title: string): MenuEntry[] {
  const { view, pinned } = tabContext(tabId);
  if (!view) return [];
  const topic = view.kind === "topic";
  const note = view.kind === "note" ? ({ kind: "note", id: view.noteId } as const) : null;
  const focus = () => st().activate(tabId);
  return entries(
    pinEntry(tabId, pinned),
    { id: "split", label: "Split right", icon: Columns2, run: () => st().splitRight(tabId) },
    bookmarkEntry(view),
    topic && { id: "graph", label: "Show on graph", icon: Waypoints, run: () => st().open({ kind: "graph", focusTopicId: view.topicId }) },
    topic && { id: "local", label: "Open local graph", icon: Orbit, run: () => {
        focus();
        st().setRightPane("local-graph");
      },
    },
    topic && { id: "reveal", label: "Reveal in explorer", icon: ListTree, run: () => {
        focus();
        revealTopic();
      },
    },
    note && { id: "reveal", label: "Reveal in explorer", icon: ListTree, run: () => {
        focus();
        revealNote();
      },
    },
    note && { id: "move", label: "Move note to…", icon: FolderInput, run: () => useVaultUi.getState().setMoving(note) },
    copyEntry(title),
    SEP("s1"),
    note && { id: "delete-note", label: "Delete note", icon: Trash, danger: true, run: () => useVaultUi.getState().setDeleting(note) },
    { id: "close", label: "Close", icon: X, danger: true, disabled: pinned, run: () => st().close(tabId) },
  );
}
