import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { Review, ReviewQuestion } from "../../api/contract";
import { userMessageOf } from "../../api/errors";
import { Button } from "../../shared/ui/Button";
import { isAnswered } from "./model/review";
import { QuestionCard } from "./QuestionCard";
import { useSubmitReview } from "./queries";
import { useAnswers, type SaveState } from "./useAnswers";
import s from "./Review.module.css";

const SAVE_LABEL: Readonly<Record<SaveState, string>> = {
  idle: "",
  saving: "Saving…",
  saved: "Saved",
  error: "Not saved yet",
};

/** A–E or 1–5 picks an option. */
function choiceForKey(key: string, count: number): number | null {
  const letter = "abcde".indexOf(key.toLowerCase());
  const digit = "12345".indexOf(key);
  const index = letter >= 0 ? letter : digit;
  return index >= 0 && index < count ? index : null;
}

function navLabel(q: ReviewQuestion, answered: boolean): string {
  return `Question ${q.seq}, ${q.kind === "mcq" ? "multiple choice" : "written"}, ${answered ? "answered" : "not answered"}`;
}

/** Taking the test: one question at a time, answers saved as you go. */
export function TestRunner({ review }: { readonly review: Review }) {
  const questions = review.questions;
  const { answers, saveState, unsaved, set, flush, cancelPending } = useAnswers(review);
  const submit = useSubmitReview();
  const firstOpen = questions.findIndex((q) => !isAnswered(q.response));
  const [index, setIndex] = useState(firstOpen === -1 ? questions.length : firstOpen);
  const navigated = useRef(false);
  const focusRef = useRef<HTMLDivElement>(null);

  const answered = questions.filter((q) => isAnswered(answers[q.id])).length;
  const unanswered = questions.filter((q) => !isAnswered(answers[q.id]));
  const onSubmitStep = index >= questions.length;
  const current = questions[index];

  useEffect(() => {
    if (navigated.current) focusRef.current?.focus();
  }, [index]);

  const go = (next: number) => {
    navigated.current = true;
    void flush();
    setIndex(Math.max(0, Math.min(next, questions.length)));
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLTextAreaElement || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === "]" || e.key === "[") {
      e.preventDefault();
      go(index + (e.key === "]" ? 1 : -1));
      return;
    }
    if (current?.kind !== "mcq") return;
    const choice = choiceForKey(e.key, current.choices.length);
    if (choice === null) return;
    e.preventDefault();
    set(current.id, String(choice), true);
  };

  // The submit carries every answer, so a save that failed or hasn't fired yet can't
  // change what gets graded.
  const handIn = () => {
    cancelPending();
    submit.mutate({ id: review.id, answers: { ...answers } });
  };

  return (
    <section className={s.runner} aria-label="Test" onKeyDown={onKeyDown}>
      <div className={s.runnerHead}>
        <div
          className={s.progress}
          role="progressbar"
          aria-label="Questions answered"
          aria-valuemin={0}
          aria-valuemax={questions.length}
          aria-valuenow={answered}
        >
          <span style={{ width: `${(answered / Math.max(1, questions.length)) * 100}%` }} />
        </div>
        <p className={s.runnerStatus}>
          <span>
            {answered} of {questions.length} answered
          </span>
          <span className={s.saveState} data-state={saveState}>
            {SAVE_LABEL[saveState]}
          </span>
        </p>
        {unsaved > 0 && (
          <p className={s.error} role="alert">
            {unsaved === 1 ? "One answer" : `${unsaved} answers`} couldn't be saved yet. They're kept here and go in
            with the rest when you hand in.
          </p>
        )}
      </div>

      <nav aria-label="Questions" className={s.qnav}>
        <ol className={s.qnavList}>
          {questions.map((q, i) => {
            const done = isAnswered(answers[q.id]);
            const newSection = i > 0 && q.kind !== questions[i - 1].kind;
            return (
              <li key={q.id} className={newSection ? s.qnavBreak : undefined}>
                <button
                  type="button"
                  className={s.qnavItem}
                  data-answered={done}
                  data-kind={q.kind}
                  aria-current={i === index ? "step" : undefined}
                  aria-label={navLabel(q, done)}
                  title={navLabel(q, done)}
                  onClick={() => go(i)}
                >
                  {q.seq}
                </button>
              </li>
            );
          })}
          <li className={s.qnavBreak}>
            <button
              type="button"
              className={`${s.qnavItem} ${s.qnavSubmit}`}
              aria-current={onSubmitStep ? "step" : undefined}
              onClick={() => go(questions.length)}
            >
              Hand in
            </button>
          </li>
        </ol>
      </nav>

      {current ? (
        <>
          <p className={s.sectionLabel}>{current.kind === "mcq" ? "Multiple choice" : "Written answer"}</p>
          <QuestionCard
            ref={focusRef}
            question={current}
            total={questions.length}
            response={answers[current.id] ?? null}
            onAnswer={(response, immediate) => set(current.id, response, immediate)}
          />
        </>
      ) : (
        <div ref={focusRef} className={s.submitPanel} tabIndex={-1} role="group" aria-labelledby="hand-in-title">
          <h3 id="hand-in-title" className={s.submitTitle}>
            Ready to hand it in?
          </h3>
          <p>
            {answered} of {questions.length} answered.
            {unanswered.length > 0 && ` Blank answers count as missed, and the study guide will cover them.`}
          </p>
          {unanswered.length > 0 && (
            <p className={s.jumpList}>
              {unanswered.map((q) => (
                <button key={q.id} type="button" className={s.inlineLink} onClick={() => go(questions.indexOf(q))}>
                  Question {q.seq}
                </button>
              ))}
            </p>
          )}
          <p className={s.muted}>Answers lock when you hand in. Grading takes a minute or two.</p>
          <Button variant="primary" onClick={handIn} disabled={submit.isPending}>
            {submit.isPending ? "Handing in…" : "Hand in answers"}
          </Button>
          {submit.error && (
            <p className={s.error} role="alert">
              {userMessageOf(submit.error)}
            </p>
          )}
        </div>
      )}

      <div className={s.runnerFoot}>
        <Button variant="ghost" onClick={() => go(index - 1)} disabled={index === 0}>
          ← Previous
        </Button>
        <span className={s.keysHint} aria-hidden>
          A–D to answer · [ ] to move
        </span>
        {!onSubmitStep && (
          <Button onClick={() => go(index + 1)}>{index === questions.length - 1 ? "Review and hand in →" : "Next →"}</Button>
        )}
      </div>
    </section>
  );
}
