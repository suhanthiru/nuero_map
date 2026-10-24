import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Review } from "../../api/contract";
import { reviewKeys, saveAnswer } from "./queries";

/** Written answers save this long after the last keystroke; choices save at once. */
const TYPING_SAVE_DELAY_MS = 700;

export type SaveState = "idle" | "saving" | "saved" | "error";

export interface Answers {
  readonly answers: Readonly<Record<string, string | null>>;
  readonly saveState: SaveState;
  /** Questions whose latest answer hasn't reached the backend after a failed save. */
  readonly unsaved: number;
  /** Records an answer; `immediate` skips the typing delay. */
  set: (questionId: string, response: string | null, immediate: boolean) => void;
  /** Sends answers still waiting on the typing delay, retries failed ones, waits for all. */
  flush: () => Promise<void>;
  /** Drops waiting saves (the submit carries every answer instead). */
  cancelPending: () => void;
}

/**
 * The answers being given on a test. Each change is saved to the backend (in order, per
 * question) and mirrored into the cached review, so leaving and coming back shows them.
 */
export function useAnswers(review: Review): Answers {
  const client = useQueryClient();
  const [answers, setAnswers] = useState<Record<string, string | null>>(() =>
    Object.fromEntries(review.questions.map((q) => [q.id, q.response])),
  );
  const [inflight, setInflight] = useState(0);
  const [failed, setFailed] = useState<ReadonlySet<string>>(new Set());
  const [everSaved, setEverSaved] = useState(false);
  const latest = useRef(answers);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const chains = useRef(new Map<string, Promise<void>>());

  const persist = useCallback(
    (questionId: string) => {
      setInflight((n) => n + 1);
      // Chain per question so a slow earlier save can't land after a newer one.
      const previous = chains.current.get(questionId) ?? Promise.resolve();
      const next = previous.then(() =>
        saveAnswer(review.id, questionId, latest.current[questionId] ?? null).then(
          () => {
            setEverSaved(true);
            setFailed((f) => (f.has(questionId) ? new Set([...f].filter((id) => id !== questionId)) : f));
          },
          () => setFailed((f) => new Set(f).add(questionId)),
        ),
      );
      chains.current.set(questionId, next);
      void next.finally(() => setInflight((n) => n - 1));
      return next;
    },
    [review.id],
  );

  const set = useCallback(
    (questionId: string, response: string | null, immediate: boolean) => {
      latest.current = { ...latest.current, [questionId]: response };
      setAnswers(latest.current);
      client.setQueryData<Review>(reviewKeys.detail(review.id), (cached) =>
        cached && {
          ...cached,
          questions: cached.questions.map((q) => (q.id === questionId ? { ...q, response } : q)),
        },
      );
      clearTimeout(timers.current.get(questionId));
      timers.current.delete(questionId);
      if (immediate) {
        void persist(questionId);
        return;
      }
      timers.current.set(
        questionId,
        setTimeout(() => {
          timers.current.delete(questionId);
          void persist(questionId);
        }, TYPING_SAVE_DELAY_MS),
      );
    },
    [client, persist, review.id],
  );

  const cancelPending = useCallback(() => {
    timers.current.forEach((timer) => clearTimeout(timer));
    timers.current.clear();
  }, []);

  const flush = useCallback(async () => {
    const waiting = [...timers.current.keys()];
    cancelPending();
    const retry = [...failed].filter((id) => !waiting.includes(id));
    await Promise.allSettled([...waiting, ...retry].map((id) => persist(id)));
  }, [cancelPending, failed, persist]);

  // Leaving mid-sentence (switching weeks or views, hiding or closing the window) still
  // saves it.
  const flushRef = useRef(flush);
  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);
  useEffect(() => {
    const save = () => void flushRef.current();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") save();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", save);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", save);
      save();
    };
  }, []);

  const saveState: SaveState =
    failed.size > 0 ? "error" : inflight > 0 ? "saving" : everSaved ? "saved" : "idle";
  return { answers, saveState, unsaved: failed.size, set, flush, cancelPending };
}
