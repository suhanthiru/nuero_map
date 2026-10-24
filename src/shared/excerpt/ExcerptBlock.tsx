import type { Excerpt } from "../../api/contract";
import { formatDate } from "../format/dates";
import { APP_LABEL, speakerLabel } from "./apps";
import s from "./Excerpt.module.css";

interface Props {
  readonly excerpt: Excerpt;
  /** Opens the original message in the source drawer. */
  readonly onOpenSource?: (messageId: string) => void;
  /** Clamp to this many lines (verbatim text is never shortened, only visually clamped). */
  readonly clampLines?: number;
  readonly showMeta?: boolean;
}

/**
 * The one place excerpts are rendered, so the user's words (ink, heavier rule) and the
 * AI's words (lighter rust, thin rule) look the same everywhere.
 */
export function ExcerptBlock({ excerpt, onOpenSource, clampLines, showMeta = true }: Props) {
  const { source } = excerpt;
  const clampStyle = clampLines ? { WebkitLineClamp: clampLines } : undefined;
  return (
    <figure className={s.excerpt} data-speaker={source.speaker}>
      {showMeta && (
        <figcaption className={s.meta}>
          <span className={s.speaker}>{speakerLabel(source.speaker, source.app)}</span>
          <span className={s.dot} aria-hidden>
            ·
          </span>
          <span>{APP_LABEL[source.app]}</span>
          <span className={s.dot} aria-hidden>
            ·
          </span>
          <time dateTime={source.timestamp}>{formatDate(source.timestamp)}</time>
          {onOpenSource && (
            <button type="button" className={s.open} onClick={() => onOpenSource(source.messageId)}>
              open source
            </button>
          )}
        </figcaption>
      )}
      <blockquote className={clampLines ? `${s.text} ${s.clamped}` : s.text} style={clampStyle}>
        {excerpt.text}
      </blockquote>
    </figure>
  );
}
