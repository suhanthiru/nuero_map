import type { KeyboardEvent } from "react";
import { cycleFocus, moveFocus, mostImportant, type Direction } from "../model/keyboardNav";
import type { PlacedNode } from "../model/types";

const ARROWS: Readonly<Record<string, Direction>> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
};

export interface KeyActions {
  readonly nodes: readonly PlacedNode[];
  readonly focusedId: string | null;
  readonly selectedId: string | null;
  setFocus: (id: string | null) => void;
  select: (id: string) => void;
  open: (id: string) => void;
  clear: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  fit: () => void;
}

/** Returns true when the key was handled. */
function dispatch(key: string, a: KeyActions): boolean {
  const dir = ARROWS[key];
  if (dir) {
    a.setFocus(moveFocus(a.nodes, a.focusedId, dir));
    return true;
  }
  switch (key) {
    case "]":
      a.setFocus(cycleFocus(a.nodes, a.focusedId, false));
      return true;
    case "[":
      a.setFocus(cycleFocus(a.nodes, a.focusedId, true));
      return true;
    case "Home":
      a.setFocus(mostImportant(a.nodes));
      return true;
    case "Enter":
      if (!a.focusedId) return false;
      if (a.focusedId === a.selectedId) a.open(a.focusedId);
      else a.select(a.focusedId);
      return true;
    case "Escape":
      a.clear();
      return true;
    case "+":
    case "=":
      a.zoomIn();
      return true;
    case "-":
    case "_":
      a.zoomOut();
      return true;
    case "0":
      a.fit();
      return true;
    default:
      return false;
  }
}

/**
 * Keyboard model for the map (also shown in the on-screen help): arrows move between
 * nearby topics, [ and ] step by importance, Home jumps to the liveliest topic, Enter
 * selects (Enter again opens), Escape clears, + / - / 0 zoom.
 */
export function graphKeyHandler(a: KeyActions): (e: KeyboardEvent) => void {
  return (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (dispatch(e.key, a)) e.preventDefault();
  };
}
