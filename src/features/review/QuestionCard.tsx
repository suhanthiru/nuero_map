import { forwardRef, useId } from "react";
import type { ReviewQuestion } from "../../api/contract";
import { chosenIndex, DIFFICULTY_LABEL, LETTERS } from "./model/review";
import s from "./Review.module.css";

/** Longest written answer the backend stores. */
const MAX_ANSWER_CHARS = 6000;

interface Props {
  readonly question: ReviewQuestion;
  readonly total: number;
  readonly response: string | null;
  readonly onAnswer: (response: string | null, immediate: boolean) => void;
}

function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

/** One question: a radio group for multiple choice, a text box for written answers. */
export const QuestionCard = forwardRef<HTMLDivElement, Props>(function QuestionCard(
  { question: q, total, response, onAnswer },
  ref,
) {
  const promptId = useId();
  const hintId = useId();
  const selected = chosenIndex(response);
  const meta = (
    <p className={s.qMeta}>
      <span>
        Question {q.seq} of {total}
      </span>
      {q.topic && <span>{q.topic.title}</span>}
      <span>{DIFFICULTY_LABEL[q.difficulty]}</span>
    </p>
  );

  if (q.kind === "mcq") {
    return (
      <div ref={ref} className={s.questionCard} tabIndex={-1}>
        {meta}
        <fieldset className={s.fieldset}>
          <legend id={promptId} className={s.prompt}>
            {q.prompt}
          </legend>
          <div className={s.choices}>
            {q.choices.map((choice, i) => (
              <label key={i} className={s.choice} data-selected={selected === i}>
                <input
                  type="radio"
                  className={s.choiceInput}
                  name={`question-${q.id}`}
                  checked={selected === i}
                  onChange={() => onAnswer(String(i), true)}
                />
                <span className={s.choiceLetter} aria-hidden>
                  {LETTERS[i]}
                </span>
                <span className={s.choiceText}>{choice}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>
    );
  }

  const text = response ?? "";
  return (
    <div ref={ref} className={s.questionCard} tabIndex={-1} role="group" aria-labelledby={promptId}>
      {meta}
      <label id={promptId} htmlFor={`answer-${q.id}`} className={s.prompt}>
        {q.prompt}
      </label>
      <p id={hintId} className={s.hint}>
        Answer from memory, in your own words, as if explaining it to a friend. A few sentences is plenty.
      </p>
      <textarea
        id={`answer-${q.id}`}
        className={s.answerBox}
        rows={8}
        maxLength={MAX_ANSWER_CHARS}
        value={text}
        aria-describedby={hintId}
        onChange={(e) => onAnswer(e.target.value, false)}
      />
      <p className={s.wordCount} aria-hidden>
        {wordCount(text)} words
      </p>
    </div>
  );
});
