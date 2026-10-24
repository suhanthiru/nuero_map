import type { LucideIcon } from "lucide-react";
import { create } from "zustand";

export type MenuEntry =
  | {
      readonly kind?: "item";
      readonly id: string;
      readonly label: string;
      readonly icon?: LucideIcon;
      /** Set for a choice in a group (sort order, current tab): rendered as a radio item. */
      readonly checked?: boolean;
      readonly disabled?: boolean;
      readonly danger?: boolean;
      readonly hint?: string;
      readonly run: () => void;
    }
  | { readonly kind: "separator"; readonly id: string };

export interface MenuRequest {
  readonly label: string;
  readonly entries: readonly MenuEntry[];
  /** Where the menu's top-left corner should go; it is nudged to stay on screen. */
  readonly x: number;
  readonly y: number;
  /** Gets focus back when the menu closes with Esc or a choice. */
  readonly trigger: HTMLElement | null;
  /** A button that toggles the menu: pressing it again closes rather than reopens. */
  readonly toggles?: boolean;
  /** `x` is where the menu's right edge goes. */
  readonly alignEnd?: boolean;
}

interface MenuState {
  readonly menu: MenuRequest | null;
  readonly openedAt: number;
  openMenu: (menu: MenuRequest) => void;
  closeMenu: (restoreFocus?: boolean) => void;
}

/** The Menu key can arrive as keydown and as contextmenu; one press opens one menu. */
const DOUBLE_OPEN_MS = 250;

export const useMenu = create<MenuState>((set, get) => ({
  menu: null,
  openedAt: 0,
  openMenu: (menu) => {
    const { menu: current, openedAt } = get();
    if (current && current.trigger === menu.trigger && performance.now() - openedAt < DOUBLE_OPEN_MS) return;
    set({ menu, openedAt: performance.now() });
  },
  closeMenu: (restoreFocus = true) => {
    const trigger = get().menu?.trigger;
    set({ menu: null });
    if (restoreFocus && trigger?.isConnected) trigger.focus();
  },
}));

/** Drops falsy entries, so callers can write `cond && item` while building a menu. */
export function entries(...list: readonly (MenuEntry | false | null | undefined)[]): MenuEntry[] {
  return list.filter((e): e is MenuEntry => !!e);
}
