import { useEffect, useId, useRef, useState } from "react";
import { nameProblem, normalizeName } from "./model/names";
import s from "./Vault.module.css";

interface Props {
  readonly initial: string;
  readonly label: string;
  /** Resolves false when the backend refused the name; the field stays open to fix it. */
  readonly onCommit: (name: string) => Promise<boolean>;
  readonly onCancel: () => void;
}

/** In-place rename in the explorer: Enter or leaving the field saves, Esc cancels. */
export function NameField({ initial, label, onCommit, onCancel }: Props) {
  const [draft, setDraft] = useState(initial);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  // Esc closes the field; a blur arriving after that must not save the draft.
  const closed = useRef(false);
  const errorId = useId();
  const problem = nameProblem(draft);

  useEffect(() => {
    const el = input.current;
    el?.focus();
    el?.select();
  }, []);

  const cancel = () => {
    closed.current = true;
    onCancel();
  };

  const commit = async () => {
    if (busy || closed.current) return;
    const name = normalizeName(draft);
    if (problem || name === initial) {
      cancel();
      return;
    }
    setBusy(true);
    const ok = await onCommit(name);
    setBusy(false);
    if (ok) cancel();
    else input.current?.focus();
  };

  return (
    <span className={s.nameField}>
      <input
        ref={input}
        className={s.nameInput}
        value={draft}
        aria-label={label}
        aria-invalid={!!problem}
        aria-describedby={problem ? errorId : undefined}
        spellCheck={false}
        disabled={busy}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") {
            e.preventDefault();
            void commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            e.nativeEvent.stopImmediatePropagation();
            cancel();
          }
        }}
      />
      {problem && (
        <span id={errorId} className={s.nameError} role="alert">
          {problem}
        </span>
      )}
    </span>
  );
}
