import type { Excerpt } from "./sources";
import type { IdeaId, IsoDateTime, TopicId } from "./ids";

export type ReviewId = string;
/** Local calendar date, "YYYY-MM-DD". Weeks are named by their Monday. */
export type LocalDate = string;

export type ReviewStatus = "generating" | "ready" | "grading" | "graded" | "failed";
export type QuestionKind = "mcq" | "frq";
export type Difficulty = "recall" | "understand" | "apply";
export type Verdict = "met" | "partial" | "missed";
export type StudyPriority = "review_now" | "refresh" | "solid";

export interface ReviewBrief {
  readonly id: ReviewId;
  readonly status: ReviewStatus;
  /** 0..1 once graded. */
  readonly score: number | null;
  readonly createdAt: IsoDateTime;
}

/** One Monday-to-Sunday week and what a test on it would cover. */
export interface ReviewWeek {
  readonly weekOf: LocalDate;
  readonly lastDay: LocalDate;
  readonly isCurrent: boolean;
  readonly ideaCount: number;
  readonly topicCount: number;
  readonly topTopics: readonly string[];
  readonly canReview: boolean;
  readonly plannedMcq: number;
  readonly plannedFrq: number;
  /** The newest test on this week, if any. */
  readonly latest: ReviewBrief | null;
}

export interface TopicRef {
  readonly id: TopicId;
  readonly title: string;
}

/** An idea a question or study note came from, with the quote to re-read. */
export interface SourceIdea {
  readonly ideaId: IdeaId;
  readonly title: string;
  readonly topicId: TopicId | null;
  readonly excerpt: Excerpt;
}

export interface KeyPoint {
  readonly text: string;
  readonly verdict: Verdict | null;
}

/**
 * A test question. `response` is the chosen option index (as text) for multiple choice,
 * or the written answer. Everything below `maxPoints` stays empty until graded.
 */
export interface ReviewQuestion {
  readonly id: string;
  readonly seq: number;
  readonly kind: QuestionKind;
  readonly topic: TopicRef | null;
  readonly difficulty: Difficulty;
  readonly prompt: string;
  readonly choices: readonly string[];
  readonly response: string | null;
  readonly maxPoints: number;
  readonly answerIndex: number | null;
  /** Multiple choice: why the answer is right. Free response: a model answer. */
  readonly explanation: string | null;
  readonly keyPoints: readonly KeyPoint[];
  readonly points: number | null;
  readonly feedback: string | null;
  readonly sources: readonly SourceIdea[];
}

export interface GuideSection {
  readonly topic: TopicRef | null;
  readonly title: string;
  readonly priority: StudyPriority;
  readonly why: string;
  readonly keyIdeas: readonly string[];
  readonly misconception: string | null;
  readonly practice: readonly string[];
  readonly sources: readonly SourceIdea[];
  readonly questionSeqs: readonly number[];
}

export interface StudyGuide {
  readonly overview: string;
  readonly strengths: readonly string[];
  readonly sections: readonly GuideSection[];
  readonly nextSteps: readonly string[];
}

export interface Review {
  readonly id: ReviewId;
  readonly weekOf: LocalDate;
  readonly lastDay: LocalDate;
  readonly status: ReviewStatus;
  readonly model: string;
  readonly ideaCount: number;
  /** Why the last step failed, in words for the user. */
  readonly error: string | null;
  readonly score: number | null;
  readonly createdAt: IsoDateTime;
  readonly submittedAt: IsoDateTime | null;
  readonly gradedAt: IsoDateTime | null;
  readonly questions: readonly ReviewQuestion[];
  readonly guide: StudyGuide | null;
}
