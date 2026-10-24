import { describe, expect, it } from "vitest";
import type { Review, ReviewQuestion, ReviewWeek } from "../../../api/contract";
import {
  chosenIndex,
  defaultWeek,
  estimateMinutes,
  formatPoints,
  guideMarkdown,
  questionResult,
  reviewNudge,
  scoreBreakdown,
  weekRange,
  weekStatus,
} from "./review";

function week(weekOf: string, overrides: Partial<ReviewWeek> = {}): ReviewWeek {
  return {
    weekOf,
    lastDay: weekOf,
    isCurrent: false,
    ideaCount: 20,
    topicCount: 4,
    topTopics: [],
    canReview: true,
    plannedMcq: 10,
    plannedFrq: 2,
    latest: null,
    ...overrides,
  };
}

function question(overrides: Partial<ReviewQuestion>): ReviewQuestion {
  return {
    id: "q",
    seq: 1,
    kind: "mcq",
    topic: null,
    difficulty: "recall",
    prompt: "?",
    choices: ["a", "b"],
    response: null,
    maxPoints: 1,
    answerIndex: null,
    explanation: null,
    keyPoints: [],
    points: null,
    feedback: null,
    sources: [],
    ...overrides,
  };
}

const brief = (status: "ready" | "graded" | "failed", score: number | null = null) => ({
  id: "r1",
  status,
  score,
  createdAt: "2026-10-18T10:00:00Z",
});

describe("weekRange", () => {
  it("names a week by its days, spelling the month once when it doesn't change", () => {
    expect(weekRange("2026-09-21", "2026-09-27")).toBe("Sep 21–27");
    expect(weekRange("2026-09-28", "2026-10-04")).toBe("Sep 28 – Oct 4");
  });
});

describe("defaultWeek", () => {
  it("prefers a test in progress, then the newest untested week with enough material", () => {
    const thin = week("2026-10-19", { isCurrent: true, canReview: false, ideaCount: 2 });
    const fresh = week("2026-10-12");
    const graded = week("2026-10-05", { latest: brief("graded", 0.8) });
    expect(defaultWeek([thin, fresh, graded])).toBe("2026-10-12");
    expect(defaultWeek([thin, { ...fresh, latest: brief("graded") }, { ...graded, latest: brief("ready") }])).toBe("2026-10-05");
    expect(defaultWeek([thin])).toBe("2026-10-19");
    expect(defaultWeek([])).toBeNull();
  });
});

describe("weekStatus", () => {
  it("says where each week stands in words", () => {
    expect(weekStatus(week("w", { latest: brief("graded", 0.736) })).label).toBe("Scored 74%");
    expect(weekStatus(week("w", { latest: brief("ready") })).label).toBe("In progress");
    expect(weekStatus(week("w", { canReview: false, ideaCount: 0 })).label).toBe("Nothing yet");
    expect(weekStatus(week("w", { canReview: false, ideaCount: 3 })).label).toBe("Too little");
    expect(weekStatus(week("w")).label).toBe("Not taken");
  });
});

describe("reviewNudge", () => {
  const friday = new Date(2026, 9, 23);
  const tuesday = new Date(2026, 9, 20);

  it("offers the current week only once the week is ending", () => {
    const current = week("2026-10-19", { isCurrent: true });
    const ended = week("2026-10-12", { latest: brief("graded") });
    expect(reviewNudge([current, ended], friday)).toEqual({ kind: "start", week: current });
    expect(reviewNudge([current, ended], tuesday)).toBeNull();
  });

  it("offers the week that just ended, and resumes a test in progress first", () => {
    const current = week("2026-10-19", { isCurrent: true, canReview: false });
    const ended = week("2026-10-12");
    expect(reviewNudge([current, ended], tuesday)?.kind).toBe("start");
    const open = week("2026-10-05", { latest: brief("ready") });
    expect(reviewNudge([current, ended, open], tuesday)).toEqual({ kind: "resume", week: open });
  });
});

describe("scoring helpers", () => {
  it("reads responses and classifies results", () => {
    expect(chosenIndex("2")).toBe(2);
    expect(chosenIndex("")).toBeNull();
    expect(chosenIndex(null)).toBeNull();
    expect(questionResult(question({ response: "1", points: 1 }))).toBe("correct");
    expect(questionResult(question({ response: "0", points: 0 }))).toBe("wrong");
    expect(questionResult(question({ kind: "frq", response: "text", points: 1.5, maxPoints: 3 }))).toBe("partial");
    expect(questionResult(question({ response: "  " }))).toBe("skipped");
    expect(formatPoints(1.5)).toBe("1.5");
    expect(formatPoints(2)).toBe("2");
    expect(estimateMinutes(10, 3)).toBe(20);
    expect(estimateMinutes(1, 0)).toBe(5);
  });

  it("breaks the score into multiple choice and written points", () => {
    const review = {
      score: 0.6,
      questions: [
        question({ points: 1 }),
        question({ points: 0 }),
        question({ kind: "frq", points: 1.5, maxPoints: 3 }),
      ],
    } as unknown as Review;
    expect(scoreBreakdown(review)).toEqual({ percent: 60, mcqCorrect: 1, mcqTotal: 2, frqPoints: 1.5, frqMax: 3 });
  });
});

describe("guideMarkdown", () => {
  it("writes the guide as notes with sections, warnings and quotes", () => {
    const review = {
      weekOf: "2026-09-21",
      lastDay: "2026-09-27",
      score: 0.74,
      guide: {
        overview: "Async stuck.",
        strengths: ["Futures are lazy"],
        sections: [
          {
            topic: null,
            title: "Robot arm",
            priority: "review_now",
            why: "Missed the power question.",
            keyIdeas: ["Inrush sags the rail."],
            misconception: "It isn't the signal.",
            practice: ["How would you measure the sag?"],
            sources: [{ ideaId: "i", title: "t", topicId: null, excerpt: { text: "Usually power:\nthe rail sags.", source: {} } }],
            questionSeqs: [6],
          },
        ],
        nextSteps: ["Retest Thursday."],
      },
    } as unknown as Review;

    const md = guideMarkdown(review);

    expect(md).toContain("# Study guide: Sep 21–27");
    expect(md).toContain("Score: 74%");
    expect(md).toContain("## Robot arm (Review now)");
    expect(md).toContain("**Watch out:** It isn't the signal.");
    expect(md).toContain("- Inrush sags the rail.");
    expect(md).toContain("> Usually power: the rail sags.");
    expect(md).toContain("1. Retest Thursday.");
  });
});
