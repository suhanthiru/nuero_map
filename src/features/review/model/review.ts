import type {
  Difficulty,
  Review,
  ReviewQuestion,
  ReviewStatus,
  ReviewWeek,
  StudyPriority,
  Verdict,
} from "../../../api/contract";

export const LETTERS = ["A", "B", "C", "D", "E"] as const;

const MCQ_MINUTES = 0.75;
const FRQ_MINUTES = 4;
const MINUTES_STEP = 5;
/** Days (Sunday = 0) on which the current week counts as ending. */
const WEEK_END_DAYS: ReadonlySet<number> = new Set([5, 6, 0]);
const IN_PROGRESS: ReadonlySet<ReviewStatus> = new Set(["generating", "ready", "grading"]);

const monthFormat = new Intl.DateTimeFormat("en", { month: "short" });

function localDate(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** "Sep 21–27", or "Sep 28 – Oct 4" across months. Dates are local calendar days. */
export function weekRange(weekOf: string, lastDay: string): string {
  const a = localDate(weekOf);
  const b = localDate(lastDay);
  if (a.getMonth() === b.getMonth()) return `${monthFormat.format(a)} ${a.getDate()}–${b.getDate()}`;
  return `${monthFormat.format(a)} ${a.getDate()} – ${monthFormat.format(b)} ${b.getDate()}`;
}

/** Rough time to take a test, rounded to five minutes. */
export function estimateMinutes(mcq: number, frq: number): number {
  return Math.max(MINUTES_STEP, Math.round((mcq * MCQ_MINUTES + frq * FRQ_MINUTES) / MINUTES_STEP) * MINUTES_STEP);
}

export function isInProgress(status: ReviewStatus | undefined): boolean {
  return status !== undefined && IN_PROGRESS.has(status);
}

/**
 * The week to show first: one with a test in progress, else the newest week with enough
 * material and no test yet, else the newest week that could be tested at all.
 */
export function defaultWeek(weeks: readonly ReviewWeek[]): string | null {
  const pick =
    weeks.find((w) => isInProgress(w.latest?.status)) ??
    weeks.find((w) => w.canReview && !w.latest) ??
    weeks.find((w) => w.canReview) ??
    weeks[0];
  return pick?.weekOf ?? null;
}

export type WeekTone = "done" | "open" | "busy" | "empty" | "failed";

export function weekStatus(week: ReviewWeek): { readonly label: string; readonly tone: WeekTone } {
  const latest = week.latest;
  if (latest?.status === "graded") return { label: `Scored ${Math.round((latest.score ?? 0) * 100)}%`, tone: "done" };
  if (latest?.status === "ready") return { label: "In progress", tone: "busy" };
  if (latest?.status === "generating") return { label: "Writing…", tone: "busy" };
  if (latest?.status === "grading") return { label: "Grading…", tone: "busy" };
  if (!week.canReview) return { label: week.ideaCount === 0 ? "Nothing yet" : "Too little", tone: "empty" };
  if (latest?.status === "failed") return { label: "Didn't finish", tone: "failed" };
  return { label: "Not taken", tone: "open" };
}

export type Nudge = { readonly kind: "resume" | "start"; readonly week: ReviewWeek } | null;

/**
 * Whether Today should suggest the review: a test in progress, or a week with enough
 * material and no test yet — the current week from Friday, or the week just ended.
 */
export function reviewNudge(weeks: readonly ReviewWeek[], today: Date): Nudge {
  const busy = weeks.find((w) => isInProgress(w.latest?.status));
  if (busy) return { kind: "resume", week: busy };
  const current = weeks.find((w) => w.isCurrent);
  if (current?.canReview && !current.latest && WEEK_END_DAYS.has(today.getDay())) return { kind: "start", week: current };
  const ended = weeks.find((w) => !w.isCurrent);
  if (ended?.canReview && !ended.latest) return { kind: "start", week: ended };
  return null;
}

/** The chosen option of a multiple-choice response. */
export function chosenIndex(response: string | null | undefined): number | null {
  if (response == null || response.trim() === "") return null;
  const n = Number(response);
  return Number.isInteger(n) ? n : null;
}

export function isAnswered(response: string | null | undefined): boolean {
  return response != null && response.trim() !== "";
}

export interface ScoreBreakdown {
  readonly percent: number;
  readonly mcqCorrect: number;
  readonly mcqTotal: number;
  readonly frqPoints: number;
  readonly frqMax: number;
}

export function scoreBreakdown(review: Review): ScoreBreakdown {
  const mcq = review.questions.filter((q) => q.kind === "mcq");
  const frq = review.questions.filter((q) => q.kind === "frq");
  return {
    percent: Math.round((review.score ?? 0) * 100),
    mcqCorrect: mcq.filter((q) => (q.points ?? 0) > 0).length,
    mcqTotal: mcq.length,
    frqPoints: frq.reduce((sum, q) => sum + (q.points ?? 0), 0),
    frqMax: frq.reduce((sum, q) => sum + q.maxPoints, 0),
  };
}

/** "1.5", "2". */
export function formatPoints(points: number): string {
  return Number.isInteger(points) ? String(points) : points.toFixed(1);
}

export type QuestionResult = "correct" | "partial" | "wrong" | "skipped";

export function questionResult(q: ReviewQuestion): QuestionResult {
  if (!isAnswered(q.response)) return "skipped";
  const points = q.points ?? 0;
  if (points >= q.maxPoints) return "correct";
  return points > 0 ? "partial" : "wrong";
}

export const RESULT_META: Readonly<Record<QuestionResult, { readonly label: string; readonly glyph: string }>> = {
  correct: { label: "Correct", glyph: "✓" },
  partial: { label: "Partly right", glyph: "◐" },
  wrong: { label: "Missed", glyph: "✗" },
  skipped: { label: "Skipped", glyph: "–" },
};

export const VERDICT_META: Readonly<Record<Verdict, { readonly label: string; readonly glyph: string }>> = {
  met: { label: "Made", glyph: "✓" },
  partial: { label: "Partly", glyph: "◐" },
  missed: { label: "Missed", glyph: "✗" },
};

export const PRIORITY_META: Readonly<Record<StudyPriority, { readonly label: string; readonly glyph: string }>> = {
  review_now: { label: "Review now", glyph: "●" },
  refresh: { label: "Refresh", glyph: "◐" },
  solid: { label: "Solid", glyph: "○" },
};

export const DIFFICULTY_LABEL: Readonly<Record<Difficulty, string>> = {
  recall: "Recall",
  understand: "Understand",
  apply: "Apply",
};

const bullet = (items: readonly string[]) => items.map((i) => `- ${i}`);

/** The study guide as Markdown, for pasting into notes. */
export function guideMarkdown(review: Review): string {
  const guide = review.guide;
  if (!guide) return "";
  const range = weekRange(review.weekOf, review.lastDay);
  const lines = [`# Study guide: ${range}`, "", `Score: ${Math.round((review.score ?? 0) * 100)}%`, "", guide.overview];
  if (guide.strengths.length) lines.push("", "## What stuck", ...bullet(guide.strengths));
  for (const section of guide.sections) {
    lines.push("", `## ${section.title} (${PRIORITY_META[section.priority].label})`, "", section.why);
    if (section.misconception) lines.push("", `**Watch out:** ${section.misconception}`);
    if (section.keyIdeas.length) lines.push("", "Key ideas:", ...bullet(section.keyIdeas));
    if (section.practice.length) lines.push("", "Test yourself in a few days:", ...bullet(section.practice));
    for (const source of section.sources) lines.push("", `> ${source.excerpt.text.replace(/\n+/g, " ")}`);
  }
  if (guide.nextSteps.length) lines.push("", "## This week", ...guide.nextSteps.map((s, i) => `${i + 1}. ${s}`));
  return lines.join("\n");
}
