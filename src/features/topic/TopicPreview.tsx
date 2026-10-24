import { useEffect, useId, useRef, useState, type FocusEvent, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { TopicSummary } from "../../api/contract";
import { relativeDays } from "../../shared/format/dates";
import { decayBucket } from "../../shared/model/decay";
import { STATE_LABEL, StateGlyph } from "../../shared/ui/StateGlyph";
import s from "./TopicPreview.module.css";

const SHOW_DELAY_MS = 350;
const HIDE_DELAY_MS = 120;
const GAP = 6;
const WIDTH = 320;
const MARGIN = 8;

/** Room the card needs below a link before it flips above it instead. */
const ROOM_BELOW = 180;

interface Anchor {
  readonly top?: number;
  readonly bottom?: number;
  readonly left: number;
}

function place(el: HTMLElement): Anchor {
  const r = el.getBoundingClientRect();
  const left = Math.min(Math.max(MARGIN, r.left), window.innerWidth - WIDTH - MARGIN);
  return r.bottom + ROOM_BELOW > window.innerHeight ? { bottom: window.innerHeight - r.top + GAP, left } : { top: r.bottom + GAP, left };
}

/**
 * Hovering (or focusing) a topic link shows a small preview card, like a notes app's page
 * preview. The card is a tooltip: it describes the link and never takes focus.
 */
export function TopicPreview({ topic, children }: { readonly topic: TopicSummary; readonly children: (props: PreviewTriggerProps) => ReactNode }) {
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const id = useId();

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  const show = (el: HTMLElement, delay = SHOW_DELAY_MS) => {
    clear();
    timer.current = setTimeout(() => setAnchor(place(el)), delay);
  };
  const hide = () => {
    clear();
    timer.current = setTimeout(() => setAnchor(null), HIDE_DELAY_MS);
  };

  useEffect(() => {
    if (!anchor) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setAnchor(null);
    const onScroll = () => setAnchor(null);
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [anchor]);

  useEffect(() => clear, []);

  const trigger: PreviewTriggerProps = {
    "aria-describedby": anchor ? id : undefined,
    onMouseEnter: (e) => show(e.currentTarget),
    onMouseLeave: hide,
    onFocus: (e) => show(e.currentTarget, 0),
    onBlur: hide,
  };

  return (
    <>
      {children(trigger)}
      {anchor &&
        createPortal(
          <div id={id} role="tooltip" className={s.preview} style={{ top: anchor.top, bottom: anchor.bottom, left: anchor.left, width: WIDTH }} onMouseEnter={clear} onMouseLeave={hide}>
            <p className={s.title}>
              <StateGlyph state={topic.state} size={11} /> {topic.title}
            </p>
            <p className={s.meta}>
              {STATE_LABEL[topic.state]} · {decayBucket(topic.decay)} · {topic.ideaCount} {topic.ideaCount === 1 ? "idea" : "ideas"} · last active {relativeDays(topic.lastActiveAt)}
            </p>
            {topic.summary && <p className={s.summary}>{topic.summary}</p>}
          </div>,
          document.body,
        )}
    </>
  );
}

export interface PreviewTriggerProps {
  readonly "aria-describedby": string | undefined;
  readonly onMouseEnter: (e: MouseEvent<HTMLElement>) => void;
  readonly onMouseLeave: () => void;
  readonly onFocus: (e: FocusEvent<HTMLElement>) => void;
  readonly onBlur: () => void;
}
