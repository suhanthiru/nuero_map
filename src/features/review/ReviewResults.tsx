import { useState } from "react";
import type { Review } from "../../api/contract";
import { CopyButton } from "../../shared/excerpt/CopyButton";
import { formatDate } from "../../shared/format/dates";
import { Button } from "../../shared/ui/Button";
import { SegmentedControl } from "../../shared/ui/SegmentedControl";
import { AnswerReview } from "./AnswerReview";
import { formatPoints, guideMarkdown, scoreBreakdown, weekRange } from "./model/review";
import { StudyGuide } from "./StudyGuide";
import s from "./Review.module.css";

const RING_RADIUS = 34;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

type Tab = "guide" | "answers";

const TABS: readonly { value: Tab; label: string }[] = [
  { value: "guide", label: "Study guide" },
  { value: "answers", label: "Your answers" },
];

function ScoreRing({ percent }: { readonly percent: number }) {
  return (
    <svg className={s.ring} viewBox="0 0 80 80" role="img" aria-label={`Score: ${percent} percent`}>
      <circle className={s.ringTrack} cx="40" cy="40" r={RING_RADIUS} />
      <circle
        className={s.ringValue}
        cx="40"
        cy="40"
        r={RING_RADIUS}
        strokeDasharray={RING_CIRCUMFERENCE}
        strokeDashoffset={RING_CIRCUMFERENCE * (1 - percent / 100)}
        transform="rotate(-90 40 40)"
      />
      <text className={s.ringText} x="40" y="40" dominantBaseline="central" textAnchor="middle" aria-hidden>
        {percent}%
      </text>
    </svg>
  );
}

interface Props {
  readonly review: Review;
  readonly onRetake: () => void;
}

/** The graded test: score, study guide, and every answer. */
export function ReviewResults({ review, onRetake }: Props) {
  const [tab, setTab] = useState<Tab>("guide");
  const [focusSeq, setFocusSeq] = useState<number | null>(null);
  const score = scoreBreakdown(review);

  const showQuestion = (seq: number) => {
    setTab("answers");
    setFocusSeq(seq);
  };

  return (
    <div className={s.results}>
      <section className={s.scoreCard} aria-label="Score">
        <ScoreRing percent={score.percent} />
        <div className={s.scoreText}>
          <p className={s.scoreTitle}>{weekRange(review.weekOf, review.lastDay)}</p>
          <p className={s.scoreLine}>
            {score.mcqCorrect} of {score.mcqTotal} multiple choice right
            {score.frqMax > 0 && ` · ${formatPoints(score.frqPoints)} of ${formatPoints(score.frqMax)} written points`}
          </p>
          <p className={s.muted}>
            Graded {review.gradedAt ? formatDate(review.gradedAt) : ""} · {review.model}
          </p>
        </div>
        <div className={s.scoreActions}>
          {review.guide && <CopyButton text={guideMarkdown(review)} label="Copy guide as Markdown" />}
          <Button size="sm" variant="ghost" onClick={onRetake}>
            New test on this week
          </Button>
        </div>
      </section>

      <SegmentedControl
        label="Show"
        options={TABS}
        value={tab}
        onChange={(next) => {
          setTab(next);
          setFocusSeq(null);
        }}
      />

      {tab === "guide" ? (
        review.guide ? (
          <StudyGuide guide={review.guide} onShowQuestion={showQuestion} />
        ) : (
          <p className={s.muted}>The study guide couldn't be read. Your answers are below.</p>
        )
      ) : (
        <AnswerReview questions={review.questions} focusSeq={focusSeq} />
      )}
    </div>
  );
}
