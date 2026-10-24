import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import s from "./Workspace.module.css";

const FOCUSABLE = 'button:not(:disabled), input:not(:disabled), [href], select, textarea, [tabindex]:not([tabindex="-1"])';

interface Props {
  readonly label: string;
  readonly onClose: () => void;
  readonly className?: string;
  readonly children: ReactNode;
}

/**
 * A centred dialog over a dimmed backdrop. Tab stays inside, Esc or a click outside
 * closes, and focus goes back to where it was when the dialog opened.
 */
export function Modal({ label, onClose, className, children }: Props) {
  const box = useRef<HTMLDivElement>(null);
  // Read during the first render, before an autofocused child takes focus.
  const previous = useRef(document.activeElement as HTMLElement | null);

  useEffect(() => {
    if (!box.current?.contains(document.activeElement)) box.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    const back = previous.current;
    return () => {
      if (back?.isConnected) back.focus();
    };
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      // Only the dialog closes, not the source drawer (or anything else listening on window).
      e.nativeEvent.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== "Tab" || !box.current) return;
    const items = [...box.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div className={s.modalBackdrop} onMouseDown={onClose}>
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        // Clicking the dialog's text focuses the dialog itself, so Esc and the Tab trap keep working.
        tabIndex={-1}
        className={className ?? s.switcher}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        {children}
      </div>
    </div>
  );
}
