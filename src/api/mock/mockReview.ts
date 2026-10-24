import type {
  GuideSection,
  Review,
  ReviewBrief,
  ReviewQuestion,
  ReviewWeek,
  StudyGuide,
  StudyPriority,
  Verdict,
} from "../contract";
import { mockWeeks, QUESTION_BANK, TOPIC_NOTES, type BankQuestion } from "./fixtures/review";
import { findTopic } from "./fixtures/topics";
import { runMockJob } from "./mockJobs";
import { daysAgo } from "./rng";

/** Long written answers without the rubric's words still earn partial credit. */
const PARTIAL_CREDIT_CHARS = 120;
const PRIORITY_ORDER: readonly StudyPriority[] = ["review_now", "refresh", "solid"];

interface Stored {
  review: Review;
  readonly bank: readonly BankQuestion[];
}

const reviews = new Map<string, Stored>();
let nextId = 1;

function fail(code: string, message: string): never {
  throw { code, message };
}

function stored(id: string): Stored {
  return reviews.get(id) ?? fail("not_found", `review ${id}`);
}

function buildQuestions(reviewId: string, bank: readonly BankQuestion[]): ReviewQuestion[] {
  return bank.map((b, i) => ({
    id: `${reviewId}-q${i + 1}`,
    seq: i + 1,
    kind: b.kind,
    topic: { id: b.topicId, title: findTopic(b.topicId)?.title ?? b.topicId },
    difficulty: b.difficulty,
    prompt: b.prompt,
    choices: b.choices,
    response: null,
    maxPoints: b.kind === "mcq" ? 1 : b.keyPoints.length,
    answerIndex: b.answerIndex,
    explanation: b.explanation,
    keyPoints: b.keyPoints.map((k) => ({ text: k.text, verdict: null })),
    points: null,
    feedback: null,
    sources: b.sources,
  }));
}

/** Like the backend: answers, rubrics and sources stay hidden until graded. */
function visible(review: Review): Review {
  if (review.status === "graded") return review;
  return {
    ...review,
    guide: null,
    questions: review.questions.map((q) => ({
      ...q,
      answerIndex: null,
      explanation: null,
      keyPoints: [],
      points: null,
      feedback: null,
      sources: [],
    })),
  };
}

function bankFor(week: ReviewWeek): BankQuestion[] {
  const mcqs = QUESTION_BANK.filter((q) => q.kind === "mcq").slice(0, week.plannedMcq);
  const frqs = QUESTION_BANK.filter((q) => q.kind === "frq").slice(0, week.plannedFrq);
  return [...mcqs, ...frqs];
}

function verdictFor(answer: string, keywords: readonly string[]): Verdict {
  const lower = answer.toLowerCase();
  if (keywords.some((k) => lower.includes(k))) return "met";
  return answer.length > PARTIAL_CREDIT_CHARS ? "partial" : "missed";
}

const VERDICT_POINTS: Readonly<Record<Verdict, number>> = { met: 1, partial: 0.5, missed: 0 };

function gradeQuestion(q: ReviewQuestion, bank: BankQuestion): ReviewQuestion {
  if (q.kind === "mcq") return { ...q, points: q.response === String(q.answerIndex) ? 1 : 0 };
  const answer = q.response?.trim() ?? "";
  const verdicts = bank.keyPoints.map((k) => (answer ? verdictFor(answer, k.keywords) : "missed"));
  const met = verdicts.filter((v) => v === "met").length;
  const missing = bank.keyPoints.find((_, i) => verdicts[i] !== "met");
  const feedback = !answer
    ? "You skipped this one. Compare the model answer with what you remember."
    : `You made ${met} of ${verdicts.length} points clearly.${missing ? ` The answer needed: ${missing.text.toLowerCase()}.` : " Nothing important was missing."}`;
  return {
    ...q,
    points: verdicts.reduce((sum, v) => sum + VERDICT_POINTS[v], 0),
    feedback,
    keyPoints: q.keyPoints.map((k, i) => ({ ...k, verdict: verdicts[i] })),
  };
}

function priorityFor(ratio: number): StudyPriority {
  if (ratio < 0.6) return "review_now";
  return ratio < 0.9 ? "refresh" : "solid";
}

function section(topicId: string, questions: readonly ReviewQuestion[]): GuideSection {
  const earned = questions.reduce((sum, q) => sum + (q.points ?? 0), 0);
  const max = questions.reduce((sum, q) => sum + q.maxPoints, 0);
  const priority = priorityFor(max > 0 ? earned / max : 1);
  const notes = TOPIC_NOTES[topicId];
  const wrong = questions.find((q) => q.kind === "mcq" && q.response !== null && q.points === 0);
  const picked = wrong && wrong.choices[Number(wrong.response)];
  return {
    topic: questions[0].topic,
    title: questions[0].topic?.title ?? topicId,
    priority,
    why: `You earned ${earned} of ${max} points on this topic.`,
    keyIdeas: priority === "solid" ? (notes?.keyIdeas ?? []).slice(0, 2) : (notes?.keyIdeas ?? []),
    misconception: picked && notes ? `You picked "${picked}". ${notes.misconception}` : null,
    practice: priority === "solid" ? [] : (notes?.practice ?? []),
    sources: questions.flatMap((q) => q.sources).filter((s, i, all) => all.findIndex((o) => o.ideaId === s.ideaId) === i),
    questionSeqs: questions.map((q) => q.seq),
  };
}

function buildGuide(questions: readonly ReviewQuestion[], score: number): StudyGuide {
  const byTopic = new Map<string, ReviewQuestion[]>();
  questions.forEach((q) => {
    const key = q.topic?.id ?? "";
    byTopic.set(key, [...(byTopic.get(key) ?? []), q]);
  });
  const sections = [...byTopic.entries()]
    .map(([topicId, qs]) => section(topicId, qs))
    .sort((a, b) => PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority));
  const weak = sections.filter((s) => s.priority === "review_now").map((s) => s.title);
  const solid = sections.filter((s) => s.priority === "solid").map((s) => s.title);
  return {
    overview: `You scored ${Math.round(score * 100)}%. ${solid.length ? `${solid.join(" and ")} stuck well. ` : ""}${weak.length ? `${weak.join(" and ")} need another pass before the details fade.` : "Nothing is badly shaky, so a light refresh is enough."}`,
    strengths: solid,
    sections,
    nextSteps: [
      "Tonight, re-read the quotes under Review now, then close them and explain each idea out loud.",
      "On Thursday, answer the practice questions from memory before checking.",
      "Take next week's review on Sunday evening.",
    ],
  };
}

function grade(id: string): void {
  const entry = stored(id);
  const questions = entry.review.questions.map((q, i) => gradeQuestion(q, entry.bank[i]));
  const max = questions.reduce((sum, q) => sum + q.maxPoints, 0);
  const score = max > 0 ? questions.reduce((sum, q) => sum + (q.points ?? 0), 0) / max : 0;
  entry.review = {
    ...entry.review,
    status: "graded",
    score,
    gradedAt: new Date().toISOString(),
    questions,
    guide: buildGuide(questions, score),
  };
}

function create(week: ReviewWeek, createdAt: string): Stored {
  const id = `rv-${nextId++}`;
  const bank = bankFor(week);
  const entry: Stored = {
    bank,
    review: {
      id,
      weekOf: week.weekOf,
      lastDay: week.lastDay,
      status: "generating",
      model: "claude-opus-5-5",
      ideaCount: Math.min(week.ideaCount, 80),
      error: null,
      score: null,
      createdAt,
      submittedAt: null,
      gradedAt: null,
      questions: [],
      guide: null,
    },
  };
  reviews.set(id, entry);
  return entry;
}

/** A graded review two weeks back, so the study guide is visible without waiting. */
function seedPastReview(): void {
  const week = mockWeeks()[2];
  const entry = create(week, daysAgo(15));
  const answers = ["1", "1", "0", "1", "2", "1", "1", "1"];
  const written = [
    "The guard isn't Send so the task can't hop threads, and the lock stays held while it waits. Drop it before the await.",
    "Mentions add to the score and time drains it.",
    "",
  ];
  const questions = buildQuestions(entry.review.id, entry.bank).map((q) => ({
    ...q,
    response: q.kind === "mcq" ? (answers[q.seq - 1] ?? null) : (written[q.seq - 1 - answers.length] || null),
  }));
  entry.review = { ...entry.review, status: "grading", questions, submittedAt: daysAgo(15) };
  grade(entry.review.id);
  entry.review = { ...entry.review, gradedAt: daysAgo(15) };
}

seedPastReview();

function latestFor(weekOf: string): ReviewBrief | null {
  const latest = [...reviews.values()]
    .map((e) => e.review)
    .filter((r) => r.weekOf === weekOf)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  return latest ? { id: latest.id, status: latest.status, score: latest.score, createdAt: latest.createdAt } : null;
}

export function listReviewWeeks(): ReviewWeek[] {
  return mockWeeks().map((w) => ({ ...w, latest: latestFor(w.weekOf) }));
}

export function startReview(weekOf: string): Review {
  const week = mockWeeks().find((w) => w.weekOf === weekOf) ?? fail("invalid_input", `no week ${weekOf}`);
  if (!week.canReview) fail("invalid_input", "not enough ideas that week");
  const entry = create(week, new Date().toISOString());
  runMockJob("review", 1, ["synthesizing"], () => {
    entry.review = { ...entry.review, status: "ready", questions: buildQuestions(entry.review.id, entry.bank) };
  });
  return visible(entry.review);
}

export function getReview(id: string): Review {
  return visible(stored(id).review);
}

export function saveReviewAnswer(reviewId: string, questionId: string, response: string | null): null {
  const entry = stored(reviewId);
  if (entry.review.status !== "ready") fail("invalid_input", "answers are locked");
  entry.review = {
    ...entry.review,
    questions: entry.review.questions.map((q) => (q.id === questionId ? { ...q, response } : q)),
  };
  return null;
}

export function submitReview(id: string, answers: Readonly<Record<string, string | null>>): Review {
  const entry = stored(id);
  if (entry.review.status !== "ready") fail("invalid_input", "this test isn't taking answers");
  entry.review = {
    ...entry.review,
    status: "grading",
    submittedAt: new Date().toISOString(),
    questions: entry.review.questions.map((q) => (q.id in answers ? { ...q, response: answers[q.id] } : q)),
  };
  runMockJob("review", 1, ["synthesizing"], () => grade(id));
  return visible(entry.review);
}
