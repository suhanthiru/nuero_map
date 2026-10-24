import { relativeDays } from "../../shared/format/dates";
import { STATE_LABEL, StateGlyph } from "../../shared/ui/StateGlyph";
import { useOpen } from "../workspace/useOpen";
import { useAliveTopics } from "./queries";
import s from "./Home.module.css";

/**
 * Ranked bars: the topics with the most life in them right now. Single series, so no
 * legend; every bar is directly labelled with its topic and value.
 */
export function AliveList() {
  const topics = useAliveTopics();
  const { openTopic } = useOpen();
  const rows = [...(topics.data ?? [])].sort((a, b) => b.decay - a.decay);
  return (
    <section aria-labelledby="alive-heading" className={s.section}>
      <h2 id="alive-heading" className={s.sectionTitle}>
        Most alive right now
      </h2>
      {topics.isPending && <p className={s.muted}>Loading…</p>}
      <ol className={s.alive}>
        {rows.map((t) => {
          const pct = Math.round(t.decay * 100);
          return (
            <li key={t.id} className={s.aliveRow}>
              <button type="button" className={s.aliveName} onClick={(e) => openTopic(t.id, e)} onAuxClick={(e) => openTopic(t.id, e)}>
                <StateGlyph state={t.state} size={11} title={STATE_LABEL[t.state]} /> {t.title}
              </button>
              <span className={s.aliveTrack} aria-hidden>
                <span className={s.aliveFill} style={{ width: `${pct}%` }} />
              </span>
              <span className={s.aliveValue}>
                {pct}% <span className={s.footText}>· {relativeDays(t.lastActiveAt)}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
