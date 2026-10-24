import { useEffect } from "react";
import type { ReviewQuestion } from "../../api/contract";
import {
  chosenIndex,
  formatPoints,
  LETTERS,
  questionResult,
  RESULT_META,
  VERDICT_META,
} from "./model/review";
import { SourceList } from "./StudyGuide";
import s from "./Review.module.css";

function ChoiceList({ q }: { readonly q: ReviewQuestion }) {
  const chosen = chosenIndex(q.response);
  return (
    <ul className={s.answerChoices}>
      {q.choices.map((choice, i) => {
        const correct = i === q.answerIndex;
        const picked = i === chosen;
        return (
          <li key={i} className={s.answerChoice} data-correct={correct} data-picked={picked}>
            <span className={s.choiceLetter} aria-hidden>
              {LETTERS[i]}
            </span>
            <span className={s.choiceText}>{choice}</span>
            {(correct || picked) && (
              <span className={s.choiceTag}>
                {correct && picked ? "✓ Your answer" : correct ? "✓ Correct answer" : "✗ Your answer"}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Written({ q }: { readonly q: ReviewQuestion }) {
  return (
    <>
      <p className={s.subhead}>Your answer</p>
      {q.response?.trim() ? (
        <blockquote className={s.yourAnswer}>{q.response}</blockquote>
      ) : (
        <p className={s.muted}>No answer given.</p>
      )}
      <p className={s.subhead}>What a full answer needed</p>
      <ul className={s.rubric}>
        {q.keyPoints.map((point, i) => {
          const verdict = VERDICT_META[point.verdict ?? "missed"];
          return (
            <li key={i} className={s.rubricItem} data-verdict={point.verdict ?? "missed"}>
              <span className={s.verdict}>
                <span aria-hidden>{verdict.glyph}</span> {verdict.label}
              </span>
              <span>{point.text}</span>
            </li>
          );
        })}
      </ul>
      {q.feedback && <p className={s.feedback}>{q.feedback}</p>}
      {q.explanation && (
        <details className={s.modelAnswer}>
          <summary>Model answer</summary>
          <p>{q.explanation}</p>
        </details>
      )}
    </>
  );
}

interface Props {
  readonly questions: readonly ReviewQuestion[];
  /** Scroll to and focus this question (from a study guide link). */
  readonly focusSeq: number | null;
}

/** Every question with your answer, the right one, and why. */
export function AnswerReview({ questions, focusSeq }: Props) {
  useEffect(() => {
    if (focusSeq === null) return;
    const el = document.getElementById(`answer-${focusSeq}`);
    el?.focus({ preventScroll: true });
    el?.scrollIntoView?.({ block: "start" });
  }, [focusSeq]);

  return (
    <ol className={s.answers} aria-label="Your answers">
      {questions.map((q) => {
        const result = questionResult(q);
        const meta = RESULT_META[result];
        return (
          <li key={q.id} id={`answer-${q.seq}`} className={s.answerCard} data-result={result} tabIndex={-1}>
            <header className={s.answerHead}>
              <span className={s.answerNumber}>Q{q.seq}</span>
              {q.topic && <span className={s.answerTopic}>{q.topic.title}</span>}
              <span className={s.result} data-result={result}>
                <span aria-hidden>{meta.glyph}</span> {meta.label} · {formatPoints(q.points ?? 0)}/{formatPoints(q.maxPoints)}
              </span>
            </header>
            <p className={s.answerPrompt}>{q.prompt}</p>
            {q.kind === "mcq" ? (
              <>
                <ChoiceList q={q} />
                {q.explanation && <p className={s.explanation}>{q.explanation}</p>}
              </>
            ) : (
              <Written q={q} />
            )}
            <SourceList sources={q.sources} label="Where this came from" />
          </li>
        );
      })}
    </ol>
  );
}
