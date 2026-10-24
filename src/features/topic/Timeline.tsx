import { useState } from "react";
import type { Gem, Idea } from "../../api/contract";
import { ExcerptBlock } from "../../shared/excerpt/ExcerptBlock";
import { formatDate } from "../../shared/format/dates";
import { useSourceDrawer } from "../source/sourceDrawerStore";
import { buildTimeline, KIND_META, type TimelineEntry } from "./model/timeline";
import { usePinGem } from "./queries";
import { Section } from "./Section";
import s from "./TopicPage.module.css";

interface EntryProps {
  readonly entry: TimelineEntry;
  readonly pinned: boolean;
  readonly onPin: () => void;
}

function Entry({ entry, pinned, onPin }: EntryProps) {
  const [showRestated, setShowRestated] = useState(false);
  const openSource = useSourceDrawer((st) => st.open);
  const { idea, restatements } = entry;
  return (
    <li className={s.entry}>
      <div className={s.entryHead}>
        <h4 className={s.entryTitle}>{idea.title}</h4>
        <span className={s.tag} data-kind={idea.kind}>
          #{KIND_META[idea.kind].label.toLowerCase()}
        </span>
        <time className={s.entryDate} dateTime={idea.occurredAt}>
          {formatDate(idea.occurredAt)}
        </time>
      </div>
      {idea.summary && <p className={s.entrySummary}>{idea.summary}</p>}
      <ExcerptBlock excerpt={idea.excerpt} onOpenSource={openSource} clampLines={5} />
      <div className={s.entryActions}>
        <button type="button" className={s.inlineLink} onClick={onPin} disabled={pinned} aria-pressed={pinned}>
          {pinned ? "Pinned" : "Pin this quote"}
        </button>
        {restatements.length > 0 && (
          <button type="button" className={s.inlineLink} aria-expanded={showRestated} onClick={() => setShowRestated((v) => !v)}>
            {showRestated ? "Hide" : "Show"} {restatements.length} {restatements.length === 1 ? "restatement" : "restatements"}
          </button>
        )}
      </div>
      {showRestated && (
        <ul className={s.restated}>
          {restatements.map((r) => (
            <li key={r.id}>
              <ExcerptBlock excerpt={r.excerpt} onOpenSource={openSource} clampLines={3} />
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

interface Props {
  readonly topicId: string;
  readonly ideas: readonly Idea[];
  readonly gems: readonly Gem[];
}

/** Every idea on the topic, newest first, under a heading per month. */
export function Timeline({ topicId, ideas, gems }: Props) {
  const pin = usePinGem(topicId);
  const pinned = new Set(gems.map((g) => g.ideaId));
  const groups = buildTimeline(ideas);
  return (
    <Section title="Timeline" outline="timeline">
      {groups.length === 0 && <p className={s.muted}>No ideas yet.</p>}
      {groups.map((g) => (
        <div key={g.key} className={s.month} data-outline={`m-${g.key}`}>
          <h3 className={s.monthLabel}>{g.label}</h3>
          <ol className={s.entries}>
            {g.entries.map((e) => (
              <Entry key={e.idea.id} entry={e} pinned={pinned.has(e.idea.id)} onPin={() => pin.mutate(e.idea.id)} />
            ))}
          </ol>
        </div>
      ))}
    </Section>
  );
}
