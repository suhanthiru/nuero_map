import { useRef, type DragEvent, type KeyboardEvent, type MouseEvent } from "react";
import { ChevronDown, PanelRight, Pin, Plus, X } from "lucide-react";
import { menuTrigger, openMenuAt, tabMenu } from "./menu/menus";
import { closeOrExplain } from "./commands";
import { useMenu } from "./menu/menuStore";
import type { Pane } from "./model/panes";
import { currentView } from "./model/tabs";
import { useViewTitle, viewIcon } from "./viewMeta";
import { useWorkspace } from "./workspaceStore";
import { notify } from "./notices";
import s from "./Workspace.module.css";

const TAB_MIME = "application/x-neural-map-tab";

interface Props {
  readonly pane: Pane;
  /** The rightmost pane's tab bar also holds the right sidebar toggle. */
  readonly isLast: boolean;
  readonly focused: boolean;
}

/**
 * One pane's tabs: click to switch, middle-click or × to close, drag to reorder or onto
 * another pane, right-click (or Shift+F10) for the tab menu, the chevron lists every tab.
 * A pinned tab shows a pin instead of × (clicking it unpins) and won't close.
 */
export function TabBar({ pane, isLast, focused }: Props) {
  const { activate, close, open, moveToPane, toggleRight, rightOpen, focusPane, togglePin } = useWorkspace();
  const titleOf = useViewTitle();
  const listButton = useRef<HTMLButtonElement>(null);
  const listOpen = useMenu((st) => !!st.menu && st.menu.trigger === listButton.current);
  const { tabs, activeId } = pane.ws;

  const onDrop = (e: DragEvent, index: number) => {
    const tabId = e.dataTransfer.getData(TAB_MIME);
    if (!tabId) return;
    e.preventDefault();
    e.stopPropagation();
    moveToPane(tabId, pane.id, index);
  };
  const allowDrop = (e: DragEvent) => {
    if (e.dataTransfer.types.includes(TAB_MIME)) e.preventDefault();
  };

  const onTabKey = (e: KeyboardEvent<HTMLDivElement>, i: number) => {
    // Alt+←/→ is Back/Forward, Ctrl+… are global commands: leave them alone.
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (e.key === "Delete" && tabs[i].pinned) closeOrExplain(tabs[i].id);
    else if (e.key === "Delete") {
      const next = tabs[i + 1] ?? tabs[i - 1];
      close(tabs[i].id);
      // Keep keyboard focus on the tab strip instead of dropping it on the page.
      if (next) requestAnimationFrame(() => document.getElementById(`tab-${next.id}`)?.focus());
    }
    else if (step) {
      const next = tabs[(i + step + tabs.length) % tabs.length];
      activate(next.id);
      requestAnimationFrame(() => document.getElementById(`tab-${next.id}`)?.focus());
    } else return;
    e.preventDefault();
  };

  const showList = (e: MouseEvent<HTMLButtonElement>) => {
    const items = tabs.map((t) => ({
      id: t.id,
      label: titleOf(currentView(t)),
      checked: t.id === activeId,
      run: () => activate(t.id),
    }));
    if (listOpen) useMenu.getState().closeMenu(false);
    else openMenuAt(e.currentTarget, "Tabs in this pane", items, { toggles: true, alignEnd: true });
  };

  return (
    <div className={s.tabBar} onDragOver={allowDrop} onDrop={(e) => onDrop(e, tabs.length)}>
      <div role="tablist" aria-label="Open tabs" className={s.tabs}>
        {tabs.map((tab, i) => {
          const view = currentView(tab);
          const Icon = viewIcon(view);
          const title = titleOf(view);
          const active = tab.id === activeId;
          const menu = menuTrigger(`Tab: ${title}`, () => tabMenu(tab.id, title));
          const cls = [s.tab, active && s.tabActive, active && !focused && s.tabActiveIdle, tab.pinned && s.tabPinned].filter(Boolean).join(" ");
          return (
            <div
              key={tab.id}
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={active}
              aria-label={tab.pinned ? `${title}, pinned` : title}
              aria-controls={`panel-${tab.id}`}
              tabIndex={active ? 0 : -1}
              className={cls}
              title={title}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(TAB_MIME, tab.id);
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={allowDrop}
              onDrop={(e) => onDrop(e, i)}
              onClick={() => activate(tab.id)}
              onAuxClick={(e) => {
                if (e.button !== 1) return;
                if (tab.pinned) notify("Unpin the tab to close it");
                else close(tab.id);
              }}
              onContextMenu={menu.onContextMenu}
              onKeyDown={(e) => {
                menu.onKeyDown(e);
                if (!e.defaultPrevented) onTabKey(e, i);
              }}
            >
              <Icon size={14} strokeWidth={1.75} aria-hidden className={s.tabIcon} />
              <span className={s.tabTitle}>{title}</span>
              {tab.pinned ? (
                <button
                  type="button"
                  className={s.tabPin}
                  aria-label={`Unpin ${title}`}
                  title="Unpin"
                  tabIndex={-1}
                  onClick={(e) => {
                    e.stopPropagation();
                    togglePin(tab.id);
                  }}
                >
                  <Pin size={13} aria-hidden />
                </button>
              ) : (
                <button
                  type="button"
                  className={s.tabClose}
                  aria-label={`Close ${title}`}
                  tabIndex={-1}
                  onClick={(e) => {
                    e.stopPropagation();
                    close(tab.id);
                  }}
                >
                  <X size={13} aria-hidden />
                </button>
              )}
            </div>
          );
        })}
      </div>
      <button
        type="button"
        className={s.newTab}
        aria-label="New tab (Ctrl+T)"
        title="New tab (Ctrl+T)"
        onClick={() => {
          focusPane(pane.id);
          open({ kind: "today" }, { newTab: true });
        }}
      >
        <Plus size={15} aria-hidden />
      </button>
      <span className={s.tabBarSpacer} />
      <button
        ref={listButton}
        type="button"
        className={s.iconButton}
        aria-label="Show all tabs in this pane"
        title="Show all tabs"
        aria-haspopup="menu"
        aria-expanded={listOpen}
        onClick={showList}
      >
        <ChevronDown size={16} aria-hidden />
      </button>
      {isLast && (
        <button
          type="button"
          className={s.iconButton}
          aria-label="Toggle right sidebar"
          title="Toggle right sidebar"
          aria-pressed={rightOpen}
          onClick={toggleRight}
        >
          <PanelRight size={16} aria-hidden />
        </button>
      )}
    </div>
  );
}
