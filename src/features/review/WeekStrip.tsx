import { useRef, type KeyboardEvent } from "react";
import type { ReviewWeek } from "../../api/contract";
import { weekRange, weekStatus } from "./model/review";
import s from "./Review.module.css";

interface Props {
  readonly weeks: readonly ReviewWeek[];
  readonly selected: string | null;
  readonly onSelect: (weekOf: string) => void;
}

const STEP: Readonly<Record<string, number>> = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 };

/** Recent weeks, newest first; arrow keys move between them like a radio group. */
export function WeekStrip({ weeks, selected, onSelect }: Props) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (e: KeyboardEvent, index: number) => {
    const step = STEP[e.key];
    if (!step) return;
    e.preventDefault();
    const next = (index + step + weeks.length) % weeks.length;
    onSelect(weeks[next].weekOf);
    refs.current[next]?.focus();
  };
  return (
    <div role="radiogroup" aria-label="Week to review" className={s.weeks}>
      {weeks.map((w, i) => {
        const status = weekStatus(w);
        const checked = w.weekOf === selected;
        return (
          <button
            key={w.weekOf}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked || (selected === null && i === 0) ? 0 : -1}
            className={s.week}
            data-tone={status.tone}
            onClick={() => onSelect(w.weekOf)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            <span className={s.weekRange}>{w.isCurrent ? "This week" : weekRange(w.weekOf, w.lastDay)}</span>
            <span className={s.weekMeta}>
              {w.ideaCount} {w.ideaCount === 1 ? "idea" : "ideas"}
            </span>
            <span className={s.weekStatus}>{status.label}</span>
          </button>
        );
      })}
    </div>
  );
}
