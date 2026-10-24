import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { call } from "../../api/api";
import type { Review, ReviewWeek } from "../../api/contract";
import { isInProgress } from "./model/review";

/** Background jobs announce when they finish; this is the fallback if an event is missed. */
const BUSY_POLL_MS = 5_000;

export const reviewKeys = {
  all: ["review"] as const,
  weeks: ["review", "weeks"] as const,
  detail: (id: string) => ["review", "detail", id] as const,
};

export function useReviewWeeks() {
  return useQuery({ queryKey: reviewKeys.weeks, queryFn: () => call("list_review_weeks", {}) });
}

export function useReview(id: string | null) {
  return useQuery({
    queryKey: reviewKeys.detail(id ?? ""),
    queryFn: () => call("get_review", { id: id ?? "" }),
    enabled: id !== null,
    refetchInterval: (query) => (query.state.data?.status === "generating" || query.state.data?.status === "grading" ? BUSY_POLL_MS : false),
  });
}

/** Puts a review straight into the caches, so the page moves on before refetching. */
function remember(client: QueryClient, review: Review): void {
  client.setQueryData(reviewKeys.detail(review.id), review);
  client.setQueryData<ReviewWeek[]>(reviewKeys.weeks, (weeks) =>
    weeks?.map((w) =>
      w.weekOf === review.weekOf
        ? { ...w, latest: { id: review.id, status: review.status, score: review.score, createdAt: review.createdAt } }
        : w,
    ),
  );
  if (!isInProgress(review.status)) client.invalidateQueries({ queryKey: reviewKeys.weeks });
}

export function useStartReview() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (weekOf: string) => call("start_review", { weekOf }),
    onSuccess: (review) => remember(client, review),
  });
}

export function useSubmitReview() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, answers }: { id: string; answers: Record<string, string | null> }) =>
      call("submit_review", { id, answers }),
    onSuccess: (review) => remember(client, review),
  });
}

export function saveAnswer(reviewId: string, questionId: string, response: string | null): Promise<null> {
  return call("save_review_answer", { reviewId, questionId, response });
}
