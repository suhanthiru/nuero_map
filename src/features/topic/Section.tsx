import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import s from "./TopicPage.module.css";

interface Props {
  readonly title: string;
  /** `data-outline` id the outline pane jumps to. */
  readonly outline: string;
  readonly actions?: ReactNode;
  readonly children: ReactNode;
}

/** A page heading that folds its section, with the arrow in the left gutter like a notes app. */
export function Section({ title, outline, actions, children }: Props) {
  const [open, setOpen] = useState(true);
  const headingId = useId();
  const bodyId = useId();
  return (
    <section className={s.section} aria-labelledby={headingId} data-outline={outline}>
      <div className={s.sectionHead}>
        <button
          type="button"
          className={s.fold}
          aria-expanded={open}
          aria-controls={bodyId}
          aria-label={`${open ? "Fold" : "Unfold"} ${title}`}
          onClick={() => setOpen((o) => !o)}
        >
          <ChevronDown size={16} aria-hidden className={s.chevron} />
        </button>
        <h2 id={headingId} className={s.h2}>
          {title}
        </h2>
        {!open && <span className={s.collapsedHint}>…</span>}
        {actions && <div className={s.sectionActions}>{actions}</div>}
      </div>
      <div id={bodyId} hidden={!open}>
        {children}
      </div>
    </section>
  );
}
