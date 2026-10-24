import { useEffect, useRef } from "react";
import { ArrowUpDown, ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, LocateFixed } from "lucide-react";
import { TOPIC_STATES, type TopicState, type TopicSummary } from "../../api/contract";
import { STATE_LABEL, StateGlyph } from "../../shared/ui/StateGlyph";
import { SORT_LABEL, SORTS, sortTopics, useExplorer } from "./explorerStore";
import { menuTrigger, openMenuAt, topicMenu } from "./menu/menus";
import { useMenu } from "./menu/menuStore";
import { activeTab, currentView } from "./model/tabs";
import { useOpen } from "./useOpen";
import { useAllTopics } from "./viewMeta";
import { useWorkspace } from "./workspaceStore";
import s from "./Workspace.module.css";

interface FolderProps {
  readonly state: TopicState;
  readonly topics: readonly TopicSummary[];
  readonly activeTopicId: string | null;
}

function TopicRow({ topic, active }: { readonly topic: TopicSummary; readonly active: boolean }) {
  const { openTopic } = useOpen();
  const menu = menuTrigger(`Topic: ${topic.title}`, () => topicMenu(topic));
  return (
    <li>
      <button
        type="button"
        data-topic-row={topic.id}
        className={active ? `${s.treeItem} ${s.treeItemActive}` : s.treeItem}
        aria-current={active ? "page" : undefined}
        title={topic.summary || topic.title}
        onClick={(e) => openTopic(topic.id, e)}
        onAuxClick={(e) => openTopic(topic.id, e)}
        {...menu}
      >
        <span className={s.treeTitle}>{topic.title}</span>
        <span className={s.treeAlive} style={{ opacity: 0.35 + 0.65 * topic.decay }} aria-hidden />
      </button>
    </li>
  );
}

function Folder({ state, topics, activeTopicId }: FolderProps) {
  const open = useExplorer((st) => !st.collapsed.includes(state));
  const toggle = useExplorer((st) => st.toggleFolder);
  return (
    <li>
      <button type="button" className={s.folder} aria-expanded={open} onClick={() => toggle(state)}>
        {open ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />}
        <StateGlyph state={state} size={10} /> {STATE_LABEL[state]}
        <span className={s.folderCount}>{topics.length}</span>
      </button>
      {open && (
        <ul className={s.treeItems}>
          {topics.map((t) => (
            <TopicRow key={t.id} topic={t} active={t.id === activeTopicId} />
          ))}
        </ul>
      )}
    </li>
  );
}

/** Scrolls to and focuses the active topic's row when "reveal" is asked for. */
function useReveal(activeTopicId: string | null, topics: readonly TopicSummary[]) {
  const pending = useExplorer((st) => st.revealPending);
  const { expand, revealDone } = useExplorer();
  useEffect(() => {
    if (!pending) return;
    const topic = topics.find((t) => t.id === activeTopicId);
    if (!topic) {
      if (!activeTopicId) revealDone();
      return;
    }
    revealDone();
    expand(topic.state);
    requestAnimationFrame(() => {
      const row = [...document.querySelectorAll<HTMLElement>("[data-topic-row]")].find((el) => el.dataset.topicRow === topic.id);
      row?.scrollIntoView({ block: "nearest" });
      row?.focus();
    });
  }, [pending, activeTopicId, topics, expand, revealDone]);
}

/** The Topics pane: folders by state, with an Obsidian-style row of nav buttons. */
export function TopicExplorer() {
  const topics = useAllTopics();
  const { sort, collapsed, setSort, setAllCollapsed, requestReveal } = useExplorer();
  const ws = useWorkspace((st) => st.ws);
  const view = currentView(activeTab(ws));
  const activeTopicId = view.kind === "topic" ? view.topicId : null;
  const all = sortTopics(topics.data ?? [], sort);
  const sortButton = useRef<HTMLButtonElement>(null);
  const sortOpen = useMenu((st) => !!st.menu && st.menu.trigger === sortButton.current);
  useReveal(activeTopicId, all);

  const present = TOPIC_STATES.filter((state) => all.some((t) => t.state === state));
  const allCollapsed = present.length > 0 && present.every((state) => collapsed.includes(state));

  return (
    <div className={s.pane}>
      <div className={s.navButtons} role="toolbar" aria-label="Topic explorer">
        <button
          ref={sortButton}
          type="button"
          className={s.iconButton}
          aria-label={`Change sort order (${SORT_LABEL[sort]})`}
          title="Change sort order"
          aria-haspopup="menu"
          aria-expanded={sortOpen}
          onClick={(e) => {
            if (sortOpen) useMenu.getState().closeMenu(false);
            else
              openMenuAt(
                e.currentTarget,
                "Sort order",
                SORTS.map((key) => ({ id: key, label: SORT_LABEL[key], checked: key === sort, run: () => setSort(key) })),
                { toggles: true },
              );
          }}
        >
          <ArrowUpDown size={15} aria-hidden />
        </button>
        <button
          type="button"
          className={s.iconButton}
          aria-label={allCollapsed ? "Expand all" : "Collapse all"}
          title={allCollapsed ? "Expand all" : "Collapse all"}
          onClick={() => setAllCollapsed(!allCollapsed)}
        >
          {allCollapsed ? <ChevronsUpDown size={15} aria-hidden /> : <ChevronsDownUp size={15} aria-hidden />}
        </button>
        <button
          type="button"
          className={s.iconButton}
          aria-label="Reveal active topic"
          title="Reveal active topic"
          disabled={!activeTopicId}
          onClick={requestReveal}
        >
          <LocateFixed size={15} aria-hidden />
        </button>
      </div>
      {topics.isPending && <p className={s.paneEmpty}>Loading…</p>}
      {topics.data?.length === 0 && <p className={s.paneEmpty}>No topics yet. Import a chat export to start.</p>}
      <ul className={s.tree} aria-label="Topics by state">
        {TOPIC_STATES.map((state) => {
          const inState = all.filter((t) => t.state === state);
          return inState.length > 0 ? <Folder key={state} state={state} topics={inState} activeTopicId={activeTopicId} /> : null;
        })}
      </ul>
    </div>
  );
}
