import { X } from "lucide-react";
import { HotkeyChips } from "./CommandPalette";
import { COMMANDS } from "./commands";
import { Modal } from "./Modal";
import { useWorkspace } from "./workspaceStore";
import s from "./Workspace.module.css";

/** Keys that belong to one screen rather than the command registry. */
const IN_PLACE: readonly { readonly keys: readonly string[]; readonly what: string }[] = [
  { keys: ["Ctrl", "Click"], what: "Open in a new tab" },
  { keys: ["Ctrl", "Alt", "Click"], what: "Open to the right" },
  { keys: ["Shift", "F10"], what: "Open the menu for the focused item (or right-click)" },
  { keys: ["/"], what: "Map: find a topic" },
  { keys: ["←↑↓→"], what: "Map: move between nearby topics" },
  { keys: ["[", "]"], what: "Map: step by importance" },
  { keys: ["+", "−", "0"], what: "Map: zoom in, out, reset" },
  { keys: ["Esc"], what: "Map: clear the selection" },
];

function ShortcutsList({ onClose }: { readonly onClose: () => void }) {
  const withKeys = COMMANDS.filter((c) => c.hotkeys?.length && !c.id.startsWith("tab:go-"));
  return (
    <Modal label="Keyboard shortcuts" onClose={onClose} className={`${s.switcher} ${s.shortcuts}`}>
      <div className={s.dialogHead}>
        <h2 className={s.dialogTitle}>Keyboard shortcuts</h2>
        <button type="button" className={s.iconButton} aria-label="Close" onClick={onClose}>
          <X size={16} aria-hidden />
        </button>
      </div>
      <div className={s.shortcutsBody}>
        <h3 className={s.shortcutsGroup}>Commands</h3>
        <dl className={s.shortcutList}>
          {withKeys.map((c) => (
            <div key={c.id} className={s.shortcutRow}>
              <dt>{c.name}</dt>
              <dd>
                <HotkeyChips command={c} />
              </dd>
            </div>
          ))}
          <div className={s.shortcutRow}>
            <dt>Go to tab 1–8, last tab</dt>
            <dd>
              <span className={s.hotkey}>
                <kbd>Ctrl</kbd>
                <kbd>1–9</kbd>
              </span>
            </dd>
          </div>
        </dl>
        <h3 className={s.shortcutsGroup}>In place</h3>
        <dl className={s.shortcutList}>
          {IN_PLACE.map((row) => (
            <div key={row.what} className={s.shortcutRow}>
              <dt>{row.what}</dt>
              <dd>
                <span className={s.hotkey}>
                  {row.keys.map((k) => (
                    <kbd key={k}>{k}</kbd>
                  ))}
                </span>
              </dd>
            </div>
          ))}
        </dl>
        <p className={s.paneEmpty}>Every command, with or without a key, is in the command palette (Ctrl+P).</p>
      </div>
    </Modal>
  );
}

export function ShortcutsDialog() {
  const open = useWorkspace((st) => st.shortcutsOpen);
  const setOpen = useWorkspace((st) => st.setShortcutsOpen);
  return open ? <ShortcutsList onClose={() => setOpen(false)} /> : null;
}
