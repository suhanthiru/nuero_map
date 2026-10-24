import { useEffect, useState } from "react";
import type { ReviewWeek } from "../../api/contract";
import { userMessageOf } from "../../api/errors";
import { Button } from "../../shared/ui/Button";
import { EmptyState, Page } from "../../shared/ui/Page";
import { useOpen } from "../workspace/useOpen";
import { defaultWeek } from "./model/review";
import { useReview, useReviewWeeks } from "./queries";
import { ReviewIntro } from "./ReviewIntro";
import { ReviewResults } from "./ReviewResults";
import { ReviewWaiting } from "./ReviewWaiting";
import { TestRunner } from "./TestRunner";
import { WeekStrip } from "./WeekStrip";
import s from "./Review.module.css";

function WeekBody({ week }: { readonly week: ReviewWeek }) {
  const review = useReview(week.latest?.id ?? null);
  const [retaking, setRetaking] = useState(false);
  if (!week.latest) return <ReviewIntro week={week} />;
  if (review.isPending) return <p className={s.muted}>Loading the test…</p>;
  const data = review.data;
  // A failed background refetch keeps showing the data it already has.
  if (!data) return <p className={s.error}>{userMessageOf(review.error)}</p>;
  switch (data.status) {
    case "failed":
      return <ReviewIntro week={week} failure={data.error} />;
    case "generating":
    case "grading":
      return <ReviewWaiting review={data} />;
    case "ready":
      return (
        <>
          {data.error && (
            <p className={s.error} role="alert">
              {data.error}
            </p>
          )}
          <TestRunner key={data.id} review={data} />
        </>
      );
    case "graded":
      return retaking ? (
        <>
          <ReviewIntro week={week} retake />
          <Button variant="ghost" size="sm" onClick={() => setRetaking(false)}>
            Back to the study guide
          </Button>
        </>
      ) : (
        <ReviewResults review={data} onRetake={() => setRetaking(true)} />
      );
  }
}

/** End-of-week retrieval practice: a test on what you discussed, then a study guide. */
export function ReviewPage() {
  const weeks = useReviewWeeks();
  const [picked, setPicked] = useState<string | null>(null);
  const { open } = useOpen();
  const list = weeks.data ?? [];
  const selected = picked ?? defaultWeek(list);
  const week = list.find((w) => w.weekOf === selected) ?? null;
  // Pin the first default: finishing a test changes which week is "default", and the
  // page shouldn't jump away from the results that just arrived.
  useEffect(() => {
    if (picked === null && selected !== null) setPicked(selected);
  }, [picked, selected]);

  return (
    <Page eyebrow="Weekly review" title="What stuck this week?">
      <p className={s.lede}>
        A short test on the ideas you worked through with AI, answered from memory, then a study guide built from what you
        missed.
      </p>
      {weeks.isPending && <p className={s.muted}>Loading your weeks…</p>}
      {weeks.error && <p className={s.error}>{userMessageOf(weeks.error)}</p>}
      {weeks.data && list.every((w) => w.ideaCount === 0) && (
        <EmptyState title="Nothing to review yet">
          <p>Import a chat export and the ideas from each week show up here.</p>
          <Button size="sm" onClick={(e) => open({ kind: "import" }, e)}>
            Import a chat export
          </Button>
        </EmptyState>
      )}
      {list.length > 0 && <WeekStrip weeks={list} selected={selected} onSelect={setPicked} />}
      {week && <WeekBody key={`${week.weekOf}:${week.latest?.id ?? "new"}`} week={week} />}
    </Page>
  );
}
