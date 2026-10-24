import type { Review } from "../../api/contract";
import { weekRange } from "./model/review";
import s from "./Review.module.css";

/** While Claude writes the questions or grades the answers. */
export function ReviewWaiting({ review }: { readonly review: Review }) {
  const writing = review.status === "generating";
  return (
    <section className={s.waiting} role="status" aria-live="polite">
      <div className={s.waitingMark} aria-hidden>
        <span />
        <span />
        <span />
      </div>
      <h2 className={s.waitingTitle}>{writing ? "Writing your test" : "Grading your answers"}</h2>
      <p className={s.waitingText}>
        {writing
          ? `Claude is reading ${review.ideaCount} ideas from ${weekRange(review.weekOf, review.lastDay)} and writing questions about them.`
          : "Multiple choice is scored. Claude is reading your written answers and building your study guide."}{" "}
        This usually takes a minute or two.
      </p>
      <p className={s.muted}>You can leave this page; it carries on in the background.</p>
    </section>
  );
}
