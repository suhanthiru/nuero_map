import { createContext, useCallback, useContext } from "react";
import type { View } from "./model/tabs";
import { useWorkspace } from "./workspaceStore";

/** The bits of a mouse or keyboard event that decide "new tab" or "to the right". */
type Modifiers =
  | { readonly ctrlKey?: boolean; readonly metaKey?: boolean; readonly altKey?: boolean; readonly button?: number }
  | undefined;

/** Ctrl/Cmd+click or middle-click opens in a new tab, like a browser (and Obsidian). */
export function wantsNewTab(e: Modifiers): boolean {
  return !!e && (!!e.ctrlKey || !!e.metaKey || e.button === 1);
}

/** Ctrl+Alt+click opens to the right: in the next pane, splitting if there is none. */
export function wantsToRight(e: Modifiers): boolean {
  return !!e && (!!e.ctrlKey || !!e.metaKey) && !!e.altKey;
}

/** Right-click (and back/forward mouse buttons) also fire auxclick; they never open anything. */
export function isOpenGesture(e: Modifiers): boolean {
  return !e || e.button === undefined || e.button <= 1;
}

export interface Opener {
  open: (view: View, e?: Modifiers) => void;
  openTopic: (topicId: string, e?: Modifiers) => void;
  openToRight: (view: View) => void;
}

export function useOpen(): Opener {
  const open = useWorkspace((s) => s.open);
  const openView = useCallback(
    (view: View, e?: Modifiers) => {
      if (!isOpenGesture(e)) return;
      if (wantsToRight(e)) open(view, { toRight: true });
      else open(view, { newTab: wantsNewTab(e) });
    },
    [open],
  );
  const openTopic = useCallback((topicId: string, e?: Modifiers) => openView({ kind: "topic", topicId }, e), [openView]);
  const openToRight = useCallback((view: View) => open(view, { toRight: true }), [open]);
  return { open: openView, openTopic, openToRight };
}

export interface TabInfo {
  readonly tabId: string;
  readonly paneId: string;
  /** The tab is showing (it is its pane's current tab); animations and drawing may run. */
  readonly active: boolean;
  /** Showing and in the focused pane: only this tab should react to global keys. */
  readonly focused: boolean;
}

export const TabContext = createContext<TabInfo>({ tabId: "", paneId: "", active: true, focused: true });

export function useTab(): TabInfo {
  return useContext(TabContext);
}
