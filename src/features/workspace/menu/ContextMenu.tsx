import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { Check } from "lucide-react";
import { useMenu, type MenuEntry } from "./menuStore";
import s from "./Menu.module.css";

const EDGE = 8;

type Item = Extract<MenuEntry, { run: () => void }>;

function isItem(e: MenuEntry): e is Item {
  return e.kind !== "separator";
}

function menuItems(root: HTMLElement | null): HTMLButtonElement[] {
  return root ? [...root.querySelectorAll<HTMLButtonElement>("[data-menu-item]:not(:disabled)")] : [];
}

/**
 * The one open menu (right-click menus, ⋮ More options, sort order, tab list).
 * Arrow keys, Home/End and first letters move; Enter/Space choose; Esc closes and
 * returns focus to whatever opened it. Clicking elsewhere, scrolling or leaving the window closes it.
 */
export function ContextMenuHost() {
  const menu = useMenu((st) => st.menu);
  const closeMenu = useMenu((st) => st.closeMenu);
  const root = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });

  useLayoutEffect(() => {
    if (!menu || !root.current) return;
    const { width, height } = root.current.getBoundingClientRect();
    const left = menu.alignEnd ? menu.x - width : menu.x;
    const x = Math.max(EDGE, Math.min(left, window.innerWidth - width - EDGE));
    const below = menu.y + height <= window.innerHeight - EDGE;
    const y = below ? menu.y : Math.max(EDGE, menu.y - height);
    setPos({ x, y });
    const items = menuItems(root.current);
    (items.find((b) => b.getAttribute("aria-checked") === "true") ?? items[0])?.focus();
  }, [menu]);

  useEffect(() => {
    if (!menu) return;
    const outside = (e: Event) => {
      const target = e.target as Node | null;
      if (target && root.current?.contains(target)) return;
      if (menu.toggles && target && menu.trigger?.contains(target)) return;
      closeMenu(false);
    };
    const onBlur = () => closeMenu(false);
    document.addEventListener("pointerdown", outside, true);
    window.addEventListener("scroll", outside, true);
    window.addEventListener("resize", onBlur);
    window.addEventListener("blur", onBlur);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("scroll", outside, true);
      window.removeEventListener("resize", onBlur);
      window.removeEventListener("blur", onBlur);
    };
  }, [menu, closeMenu]);

  if (!menu) return null;

  const choose = (item: Item) => {
    closeMenu(true);
    item.run();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const items = menuItems(root.current);
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    const focus = (i: number) => items[(i + items.length) % items.length]?.focus();
    if (e.key === "ArrowDown") focus(at + 1);
    else if (e.key === "ArrowUp") focus(at - 1);
    else if (e.key === "Home") focus(0);
    else if (e.key === "End") focus(items.length - 1);
    else if (e.key === "Escape" || e.key === "Tab") closeMenu(true);
    else if (e.key.length === 1 && /\S/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const ch = e.key.toLowerCase();
      const order = [...items.slice(at + 1), ...items.slice(0, at + 1)];
      order.find((b) => b.textContent?.trim().toLowerCase().startsWith(ch))?.focus();
    } else return;
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div
      ref={root}
      role="menu"
      aria-label={menu.label}
      className={s.menu}
      style={{ left: pos.x, top: pos.y }}
      onKeyDown={onKeyDown}
      onContextMenu={(e) => e.preventDefault()}
    >
      {menu.entries.map((entry) =>
        isItem(entry) ? (
          <button
            key={entry.id}
            type="button"
            data-menu-item
            role={entry.checked === undefined ? "menuitem" : "menuitemradio"}
            aria-checked={entry.checked}
            aria-keyshortcuts={entry.hint?.replace(/Ctrl/g, "Control")}
            tabIndex={-1}
            disabled={entry.disabled}
            className={entry.danger ? `${s.item} ${s.danger}` : s.item}
            onClick={() => choose(entry)}
          >
            <span className={s.itemIcon} aria-hidden>
              {entry.checked ? <Check size={14} /> : entry.icon ? <entry.icon size={14} strokeWidth={1.75} /> : null}
            </span>
            <span className={s.itemLabel}>{entry.label}</span>
            {entry.hint && (
              <span className={s.itemHint} aria-hidden>
                {entry.hint}
              </span>
            )}
          </button>
        ) : (
          <div key={entry.id} role="separator" className={s.separator} />
        ),
      )}
    </div>
  );
}
