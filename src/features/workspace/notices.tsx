import { useEffect } from "react";
import { create } from "zustand";
import s from "./menu/Menu.module.css";

const NOTICE_MS = 2500;

interface NoticeState {
  readonly text: string | null;
  readonly nonce: number;
  notify: (text: string) => void;
  dismiss: () => void;
}

/** Short confirmations ("Copied"), shown top-right like a notes app's notices. */
export const useNotice = create<NoticeState>((set) => ({
  text: null,
  nonce: 0,
  notify: (text) => set((s) => ({ text, nonce: s.nonce + 1 })),
  dismiss: () => set({ text: null }),
}));

export function notify(text: string): void {
  useNotice.getState().notify(text);
}

export function Notices() {
  const { text, nonce, dismiss } = useNotice();
  useEffect(() => {
    if (!text) return;
    const timer = setTimeout(dismiss, NOTICE_MS);
    return () => clearTimeout(timer);
  }, [text, nonce, dismiss]);
  return (
    <div className={s.notices} role="status" aria-live="polite">
      {text && (
        <button type="button" className={s.notice} onClick={dismiss}>
          {text}
        </button>
      )}
    </div>
  );
}
