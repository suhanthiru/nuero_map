import { useId, useState } from "react";
import { ChevronDown, ClipboardList, RefreshCw } from "lucide-react";
import type { SynthesisVersion } from "../../api/contract";
import { userMessageOf } from "../../api/errors";
import { APP_LABEL } from "../../shared/excerpt/apps";
import { formatDate } from "../../shared/format/dates";
import { useSourceDrawer } from "../source/sourceDrawerStore";
import { numberCitations } from "./model/timeline";
import { useRegenerateSynthesis } from "./queries";
import s from "./TopicPage.module.css";

interface Props {
  readonly topicId: string;
  readonly current: SynthesisVersion | null;
  readonly history: readonly SynthesisVersion[];
}

/** 3–5 lines on where the topic stands, as a summary callout; every claim links to its message. */
export function CurrentState({ topicId, current, history }: Props) {
  const headingId = useId();
  const bodyId = useId();
  const [open, setOpen] = useState(true);
  const [viewing, setViewing] = useState<string | null>(null);
  const openSource = useSourceDrawer((st) => st.open);
  const regenerate = useRegenerateSynthesis(topicId);
  const shown = history.find((v) => v.id === viewing) ?? current;
  const isOld = shown !== null && current !== null && shown.id !== current.id;

  return (
    <section className={s.callout} data-callout="abstract" aria-labelledby={headingId} data-outline="state">
      <div className={s.calloutTitle}>
        <ClipboardList size={17} aria-hidden />
        <h2 id={headingId}>Current state</h2>
        <div className={s.calloutActions}>
          {history.length > 1 && shown && (
            <label className={s.versionPicker}>
              <span className="visually-hidden">Show an earlier version</span>
              <select value={shown.id} onChange={(e) => setViewing(e.target.value === current?.id ? null : e.target.value)}>
                {history.map((v) => (
                  <option key={v.id} value={v.id}>
                    v{v.version} · {formatDate(v.createdAt)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button
            type="button"
            className={s.iconButton}
            onClick={() => regenerate.mutate()}
            disabled={regenerate.isPending}
            aria-label={regenerate.isPending ? "Regenerate queued" : "Regenerate"}
            title="Regenerate"
          >
            <RefreshCw size={15} aria-hidden />
          </button>
          <button
            type="button"
            className={s.iconButton}
            aria-expanded={open}
            aria-controls={bodyId}
            aria-label={open ? "Fold current state" : "Unfold current state"}
            onClick={() => setOpen((o) => !o)}
          >
            <ChevronDown size={16} aria-hidden className={s.chevron} />
          </button>
        </div>
      </div>
      <div id={bodyId} className={s.calloutBody} hidden={!open}>
        {!shown && <p className={s.muted}>No summary yet. It's written after ideas are extracted for this topic.</p>}
        {shown && (
          <>
            {isOld && (
              <p className={s.oldNotice} role="status">
                Showing version {shown.version} from {formatDate(shown.createdAt)}.{" "}
                <button type="button" className={s.inlineLink} onClick={() => setViewing(null)}>
                  Back to latest
                </button>
              </p>
            )}
            <ol className={s.stateLines}>
              {numberCitations(shown.lines).lines.map((line, i) => (
                <li key={i} className={s.stateLine}>
                  {line.text}
                  {line.marks.map((m) => (
                    <button
                      key={m.n}
                      type="button"
                      className={s.cite}
                      onClick={() => openSource(m.source.messageId)}
                      aria-label={`Source ${m.n}: ${m.source.speaker === "user" ? "your message" : APP_LABEL[m.source.app]} on ${formatDate(m.source.timestamp)}`}
                    >
                      {m.n}
                    </button>
                  ))}
                </li>
              ))}
            </ol>
            <p className={s.versionRow}>
              v{shown.version} · {shown.model} · {formatDate(shown.createdAt)}
            </p>
          </>
        )}
        {regenerate.error && <p className={s.error}>{userMessageOf(regenerate.error)}</p>}
      </div>
    </section>
  );
}
