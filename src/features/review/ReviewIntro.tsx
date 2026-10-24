import { useId } from "react";
import type { ReviewWeek } from "../../api/contract";
import { userMessageOf } from "../../api/errors";
import { Button } from "../../shared/ui/Button";
import { useSettings } from "../settings/queries";
import { useOpen } from "../workspace/useOpen";
import { estimateMinutes, weekRange } from "./model/review";
import { useStartReview } from "./queries";
import s from "./Review.module.css";

interface Props {
  readonly week: ReviewWeek;
  /** Why the last attempt on this week failed, if it did. */
  readonly failure?: string | null;
  /** Shown above the start button when a test on this week was already taken. */
  readonly retake?: boolean;
}

/** What a test on the week would cover, and the button that starts it. */
export function ReviewIntro({ week, failure, retake = false }: Props) {
  const headingId = useId();
  const settings = useSettings();
  const start = useStartReview();
  const { open } = useOpen();
  const hasKey = settings.data?.hasApiKey ?? false;
  const range = weekRange(week.weekOf, week.lastDay);
  const minutes = estimateMinutes(week.plannedMcq, week.plannedFrq);
  const canStart = week.canReview && hasKey && !start.isPending;

  return (
    <section className={s.intro} aria-labelledby={headingId}>
      <h2 id={headingId} className={s.introTitle}>
        {retake ? `Another test on ${range}` : `${range}${week.isCurrent ? ", so far" : ""}`}
      </h2>
      <dl className={s.stats}>
        <div>
          <dt>Ideas</dt>
          <dd>{week.ideaCount}</dd>
        </div>
        <div>
          <dt>Topics</dt>
          <dd>{week.topicCount}</dd>
        </div>
        <div>
          <dt>Questions</dt>
          <dd>{week.canReview ? `~${week.plannedMcq + week.plannedFrq}` : "–"}</dd>
        </div>
        <div>
          <dt>Time</dt>
          <dd>{week.canReview ? `~${minutes} min` : "–"}</dd>
        </div>
      </dl>
      {week.topTopics.length > 0 && (
        <p className={s.topics}>
          <span className={s.topicsLabel}>Mostly</span>
          {week.topTopics.map((t) => (
            <span key={t} className={s.topicChip}>
              {t}
            </span>
          ))}
        </p>
      )}
      {week.canReview ? (
        <ol className={s.steps}>
          <li>
            Answer about {week.plannedMcq} multiple-choice and {week.plannedFrq} written questions on what you discussed,
            from memory.
          </li>
          <li>Claude grades the written answers against a rubric.</li>
          <li>You get a study guide aimed at what didn't stick, with the original quotes to re-read.</li>
        </ol>
      ) : (
        <p className={s.muted}>
          {week.ideaCount === 0
            ? "No ideas from this week yet. Import a recent chat export, then come back."
            : `Only ${week.ideaCount} ${week.ideaCount === 1 ? "idea" : "ideas"} from this week, not enough for a useful test. Pick another week.`}
        </p>
      )}
      {failure && (
        <p className={s.error} role="alert">
          The last attempt didn't finish. {failure}
        </p>
      )}
      {settings.data && !hasKey && week.canReview && (
        <p className={s.notice}>
          The test is written and graded by Claude, so it needs your Anthropic API key.{" "}
          <button type="button" className={s.inlineLink} onClick={(e) => open({ kind: "settings" }, e)}>
            Open Settings
          </button>
        </p>
      )}
      <div className={s.introActions}>
        <Button variant="primary" onClick={() => start.mutate(week.weekOf)} disabled={!canStart}>
          {start.isPending ? "Starting…" : failure ? "Try again" : "Start the test"}
        </Button>
        {week.canReview && <span className={s.muted}>Two Claude calls with your synthesis model.</span>}
      </div>
      {start.error && (
        <p className={s.error} role="alert">
          {userMessageOf(start.error)}
        </p>
      )}
    </section>
  );
}
