import { Button } from "../../shared/ui/Button";
import { useOpen } from "../workspace/useOpen";
import { estimateMinutes, reviewNudge, weekRange } from "./model/review";
import { useReviewWeeks } from "./queries";
import s from "./Review.module.css";

/** On Today: a nudge to take the weekly review once a week has ended (or to finish one). */
export function ReviewNudge() {
  const weeks = useReviewWeeks();
  const { open } = useOpen();
  const nudge = weeks.data ? reviewNudge(weeks.data, new Date()) : null;
  if (!nudge) return null;
  const { week } = nudge;
  const resume = nudge.kind === "resume";
  return (
    <aside className={s.nudge} aria-labelledby="review-nudge-title">
      <span className={s.nudgeMark} aria-hidden>
        ✎
      </span>
      <div className={s.nudgeBody}>
        <p id="review-nudge-title" className={s.nudgeTitle}>
          {resume ? "Your weekly review is waiting" : `Weekly review: ${week.isCurrent ? "this week" : weekRange(week.weekOf, week.lastDay)}`}
        </p>
        <p className={s.nudgeText}>
          {resume
            ? "Pick up where you left off."
            : `${week.ideaCount} ideas across ${week.topicCount} topics. About ${estimateMinutes(week.plannedMcq, week.plannedFrq)} minutes to find out what stuck.`}
        </p>
      </div>
      <Button size="sm" variant="primary" onClick={(e) => open({ kind: "review" }, e)}>
        {resume ? "Continue" : "Take the review"}
      </Button>
    </aside>
  );
}
