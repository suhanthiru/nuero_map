import { useEffect, useMemo, useState } from "react";
import { File } from "lucide-react";
import type { TopicSummary, VaultTree } from "../../api/contract";
import { StateGlyph } from "../../shared/ui/StateGlyph";
import { isTopicTarget, noteIdOfLink, noteLinkId, type LinkTarget } from "../topic/model/linkTarget";
import { suggestTopics } from "../topic/model/suggest";
import { linkTargets } from "../vault/linkTargets";
import { useVault } from "../vault/queries";
import { useAllTopics } from "./viewMeta";
import { Modal } from "./Modal";
import type { View } from "./model/tabs";
import { useWorkspace } from "./workspaceStore";
import s from "./Workspace.module.css";

const LIMIT = 12;
/** With nothing typed: your most recently edited notes come first, then the liveliest topics. */
const RECENT_NOTES = 5;

function results(topics: readonly TopicSummary[], vault: VaultTree | undefined, query: string): LinkTarget[] {
  const all = linkTargets(topics, vault);
  if (query.trim()) return suggestTopics(all, query, LIMIT);
  const recent = [...(vault?.notes ?? [])].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, RECENT_NOTES);
  const byId = new Map(all.map((t) => [t.id, t]));
  const notes = recent.flatMap((n) => byId.get(noteLinkId(n.id)) ?? []);
  const lively = [...topics].sort((a, b) => b.decay - a.decay);
  return [...notes, ...lively].slice(0, LIMIT);
}

function viewOf(target: LinkTarget): View {
  const noteId = noteIdOfLink(target.id);
  return noteId ? { kind: "note", noteId } : { kind: "topic", topicId: target.id };
}

/** Ctrl+O: type a few letters, Enter opens, Ctrl+Enter opens in a new tab, Ctrl+Alt+Enter to the right. */
export function QuickSwitcher() {
  const { switcherOpen, setSwitcherOpen, open } = useWorkspace();
  const topics = useAllTopics();
  const vault = useVault();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const found = useMemo(() => results(topics.data ?? [], vault.data, query), [topics.data, vault.data, query]);

  useEffect(() => {
    if (switcherOpen) {
      setQuery("");
      setActive(0);
    }
  }, [switcherOpen]);

  if (!switcherOpen) return null;
  const close = () => setSwitcherOpen(false);
  const choose = (target: LinkTarget, e: { readonly ctrlKey: boolean; readonly metaKey: boolean; readonly altKey: boolean }) => {
    const mod = e.ctrlKey || e.metaKey;
    open(viewOf(target), { newTab: mod, toRight: mod && e.altKey });
    close();
  };
  const domId = (t: LinkTarget) => `sw-${t.id.replace(/[^\w-]/g, "_")}`;

  return (
    <Modal label="Quick switcher" onClose={close}>
      <input
        className={s.switcherInput}
        placeholder="Find a topic or note…"
        aria-label="Find a topic or note"
        aria-controls="switcher-results"
        aria-activedescendant={found[active] ? domId(found[active]) : undefined}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") setActive((i) => Math.min(found.length - 1, i + 1));
          else if (e.key === "ArrowUp") setActive((i) => Math.max(0, i - 1));
          else if (e.key === "Enter" && found[active]) choose(found[active], e);
          else return;
          e.preventDefault();
        }}
      />
      <ul id="switcher-results" role="listbox" aria-label="Topics and notes" className={s.switcherList}>
        {found.map((t, i) => (
          <li
            key={t.id}
            id={domId(t)}
            role="option"
            aria-selected={i === active}
            className={s.switcherItem}
            onMouseEnter={() => setActive(i)}
            onClick={(e) => choose(t, e)}
          >
            {isTopicTarget(t) ? <StateGlyph state={t.state} size={10} /> : <File size={13} strokeWidth={1.75} aria-hidden />}
            <span className={s.switcherTitle}>{t.title}</span>
            {(t.hint ?? t.aliases[0]) && <span className={s.switcherAlias}>{t.hint ?? t.aliases[0]}</span>}
          </li>
        ))}
        {found.length === 0 && <li className={s.paneEmpty}>Nothing matches.</li>}
      </ul>
      <p className={s.switcherHint}>
        <kbd>↑↓</kbd> navigate · <kbd>Enter</kbd> open · <kbd>Ctrl</kbd>+<kbd>Enter</kbd> new tab · <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>Enter</kbd> to the right · <kbd>Esc</kbd> close
      </p>
    </Modal>
  );
}
