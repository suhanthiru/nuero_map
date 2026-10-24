import { useEffect, useMemo, useState } from "react";
import { COMMANDS, isAvailable, recentCommandIds, recordCommandUse, runCommand, type Command } from "./commands";
import { hotkeyParts, rankByName } from "./model/hotkeys";
import { Modal } from "./Modal";
import { useWorkspace } from "./workspaceStore";
import s from "./Workspace.module.css";

export function HotkeyChips({ command }: { readonly command: Command }) {
  const hotkey = command.hotkeys?.[0];
  if (!hotkey) return null;
  return (
    <span className={s.hotkey}>
      {hotkeyParts(hotkey).map((part) => (
        <kbd key={part}>{part}</kbd>
      ))}
    </span>
  );
}

function Palette({ onClose }: { readonly onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const results = useMemo(() => rankByName(COMMANDS.filter(isAvailable), query, recentCommandIds()), [query]);
  const recent = useMemo(() => new Set(recentCommandIds()), []);
  const activeId = results[active]?.id;

  // Arrow keys can move past the visible rows; keep the highlighted one in view.
  useEffect(() => {
    if (activeId) document.getElementById(`cmd-${activeId}`)?.scrollIntoView?.({ block: "nearest" });
  }, [activeId]);

  const choose = (command: Command) => {
    onClose();
    recordCommandUse(command.id);
    runCommand(command);
  };

  return (
    <Modal label="Command palette" onClose={onClose}>
      <input
        autoFocus
        className={s.switcherInput}
        placeholder="Type a command…"
        role="combobox"
        aria-label="Find a command"
        aria-expanded="true"
        aria-controls="palette-results"
        aria-activedescendant={results[active] ? `cmd-${results[active].id}` : undefined}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") setActive((i) => Math.min(results.length - 1, i + 1));
          else if (e.key === "ArrowUp") setActive((i) => Math.max(0, i - 1));
          else if (e.key === "Enter" && results[active]) choose(results[active]);
          else return;
          e.preventDefault();
        }}
      />
      <ul id="palette-results" role="listbox" aria-label="Commands" className={s.switcherList}>
        {results.map((c, i) => (
          <li
            key={c.id}
            id={`cmd-${c.id}`}
            role="option"
            aria-selected={i === active}
            className={s.switcherItem}
            onMouseEnter={() => setActive(i)}
            onClick={() => choose(c)}
          >
            <span className={s.switcherTitle}>{c.name}</span>
            {!query && recent.has(c.id) && <span className={s.switcherAlias}>recently used</span>}
            <HotkeyChips command={c} />
          </li>
        ))}
        {results.length === 0 && <li className={s.paneEmpty}>No matching commands.</li>}
      </ul>
      <p className={s.switcherHint}>
        <kbd>↑↓</kbd> navigate · <kbd>Enter</kbd> run · <kbd>Esc</kbd> close
      </p>
    </Modal>
  );
}

/** Ctrl+P: every command by name, with its hotkey. */
export function CommandPalette() {
  const open = useWorkspace((st) => st.paletteOpen);
  const setOpen = useWorkspace((st) => st.setPaletteOpen);
  return open ? <Palette onClose={() => setOpen(false)} /> : null;
}
