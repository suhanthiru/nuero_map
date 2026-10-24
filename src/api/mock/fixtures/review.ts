import type { Difficulty, QuestionKind, ReviewWeek, SourceIdea } from "../../contract";
import { MOCK_NOW } from "../rng";
import { messageText, sourceRef } from "./sources";
import { findTopic } from "./topics";

const DAY_MS = 86_400_000;
const MIN_IDEAS = 5;
const MAX_IDEAS = 80;

function source(ideaId: string, title: string, topicId: string, messageId: string): SourceIdea {
  return { ideaId, title, topicId, excerpt: { text: messageText(messageId), source: sourceRef(messageId) } };
}

const SRC = {
  lazy: source("i-lazy", "Futures are lazy", "t-rust-async", "m14"),
  mutex: source("i-mutex", "Don't hold a std Mutex across await", "t-rust-async", "m16"),
  pin: source("i-pin", "Pin keeps self-references valid", "t-rust-async", "m18"),
  messageTime: source("i7", "Decay keys off message time", "t-decay", "m8"),
  stock: source("i8", "Decay is a stock with an outflow", "t-systems-book", "m10"),
  servo: source("i-servo", "Jitter is usually power, not signal", "t-robot-arm", "m12"),
  retrieval: source("i2", "Retrieval is the product", "t-neural-map", "m2"),
  states: source("i3", "Topic states you control", "t-neural-map", "m4"),
} as const;

export interface BankKeyPoint {
  readonly text: string;
  /** The mock grader marks the point met when the answer mentions any of these. */
  readonly keywords: readonly string[];
}

export interface BankQuestion {
  readonly kind: QuestionKind;
  readonly topicId: string;
  readonly difficulty: Difficulty;
  readonly prompt: string;
  readonly choices: readonly string[];
  readonly answerIndex: number | null;
  readonly explanation: string;
  readonly keyPoints: readonly BankKeyPoint[];
  readonly sources: readonly SourceIdea[];
}

function mcq(topicId: string, difficulty: Difficulty, prompt: string, choices: readonly string[], answerIndex: number, explanation: string, sources: readonly SourceIdea[]): BankQuestion {
  return { kind: "mcq", topicId, difficulty, prompt, choices, answerIndex, explanation, keyPoints: [], sources };
}

function frq(topicId: string, difficulty: Difficulty, prompt: string, keyPoints: readonly BankKeyPoint[], explanation: string, sources: readonly SourceIdea[]): BankQuestion {
  return { kind: "frq", topicId, difficulty, prompt, choices: [], answerIndex: null, explanation, keyPoints, sources };
}

export const QUESTION_BANK: readonly BankQuestion[] = [
  mcq("t-rust-async", "recall", "What happens when you call an async function in Rust without awaiting it?", ["It starts running on a background thread right away", "It builds a future that does nothing until something polls it", "It blocks the current thread until the work finishes", "It fails to compile unless the result is used"], 1, "Futures are lazy: calling the function only builds a state machine, and nothing runs until an .await or an executor polls it. Running in the background is what tokio::spawn adds.", [SRC.lazy]),
  mcq("t-rust-async", "understand", "Why is holding a std::sync::Mutex guard across an .await a problem under tokio?", ["Mutexes can't be created inside async functions", "The guard isn't Send, and the lock stays held while the task is parked", "Awaiting releases the lock early and causes data races", "tokio refuses to run code that uses std types"], 1, "The guard can't move between worker threads, and a parked task keeps the lock, stalling every other task that needs it. Nothing releases it early.", [SRC.mutex]),
  mcq("t-rust-async", "recall", "What does Pin guarantee about a value?", ["It lives on the heap", "It is never dropped", "It won't move in memory again", "Only one thread can touch it"], 2, "Pin is a promise not to move the value, which matters because async state machines can point into themselves. Heap allocation (Box) is one way to get it, not what it means.", [SRC.pin]),
  mcq("t-decay", "understand", "Why should a topic's decay be keyed off message time rather than import time?", ["Import times aren't stored anywhere", "Otherwise each new export makes a batch of old ideas look freshly hot", "Message times are more precise", "It makes the score cheaper to compute"], 1, "An export arrives in bulk, so import time would stamp months of old ideas as new. Message time reflects when you actually thought about them.", [SRC.messageTime]),
  mcq("t-systems-book", "apply", "In stock-and-flow terms, what does the half-life set in the decay model?", ["How big each inflow is", "How fast the stock drains", "The most the stock can hold", "How often mentions are counted"], 1, "Mentions are inflows; time is a constant fractional outflow, and the half-life sets that drain rate. It doesn't cap the stock.", [SRC.stock]),
  mcq("t-robot-arm", "apply", "The wrist servo jitters whenever the elbow moves. What's the most likely cause?", ["A noisy PWM signal wire", "The elbow servo's inrush current sagging the shared supply", "Wrong inverse-kinematics angles for the wrist", "The wrist servo overheating"], 1, "The jitter tracks the elbow's movement, which points at the shared power rail sagging under inrush, not at the signal.", [SRC.servo]),
  mcq("t-neural-map", "understand", "Beyond drawing the graph, what did you decide is the real product of the neural map?", ["The force-directed layout", "Retrieving the exact excerpts where two ideas met", "Automatic topic naming", "Sharing maps with friends"], 1, "The graph is navigation; the value is clicking an edge and reading the moments where two ideas touched.", [SRC.retrieval]),
  mcq("t-neural-map", "recall", "What happens to a parked topic?", ["It's deleted after 30 days", "It gets a scheduled check-in", "It's merged into its closest topic", "It disappears from search"], 1, "Parked topics come back on a check-in date, so setting something aside doesn't mean losing it.", [SRC.states]),
  frq("t-rust-async", "understand", "Explain why holding a std Mutex guard across an .await can stall a tokio program, and what to do instead.", [
    { text: "The guard isn't Send, so the future can't move between worker threads", keywords: ["send", "thread"] },
    { text: "While the task is parked the lock stays held, so other tasks block on it", keywords: ["parked", "held", "block", "stall", "wait"] },
    { text: "Drop the guard before awaiting, or use tokio::sync::Mutex", keywords: ["drop", "tokio::sync", "async mutex", "scope"] },
  ], "A std MutexGuard isn't Send, so a future holding it across an .await can't be moved between tokio's worker threads. Worse, while the task is parked at the await it still holds the lock, so every other task that needs the mutex stalls behind it. Keep the critical section short and drop the guard before awaiting, or use tokio::sync::Mutex when the lock genuinely has to span an await.", [SRC.mutex]),
  frq("t-decay", "apply", "Describe the decay score as a stock with inflows and an outflow, and say what lengthening the half-life would change.", [
    { text: "Each mention is an inflow that raises the score", keywords: ["mention", "inflow", "adds"] },
    { text: "Time drains the score at a constant fractional rate", keywords: ["drain", "outflow", "fraction", "halves", "decays"] },
    { text: "A longer half-life drains more slowly, so topics stay alive longer", keywords: ["slower", "longer", "stay alive", "fade less"] },
  ], "The score is a stock. Every time a topic comes up, that mention flows in and raises it; meanwhile time drains it by a constant fraction, halving it every half-life. Lengthening the half-life slows the drain, so topics stay alive longer between mentions and the map changes more gradually.", [SRC.stock, SRC.messageTime]),
  frq("t-robot-arm", "apply", "Your wrist servo jitters when the elbow moves. Explain the likely cause and two fixes.", [
    { text: "The elbow servo's inrush current sags the shared supply rail", keywords: ["inrush", "sag", "voltage", "power", "current"] },
    { text: "Add a bulk capacitor near the servo header", keywords: ["capacitor", "cap"] },
    { text: "Give the servos their own power supply", keywords: ["separate", "own supply", "dedicated", "own power"] },
  ], "Because the jitter follows the elbow, the likely cause is power: when the elbow servo starts it draws a burst of current that sags the shared rail, and the wrist servo browns out. A bulk capacitor near the servo header smooths those dips, and giving the servos their own supply keeps them from dragging down each other and the controller.", [SRC.servo]),
];

export interface TopicNotes {
  readonly keyIdeas: readonly string[];
  readonly misconception: string;
  readonly practice: readonly string[];
}

export const TOPIC_NOTES: Readonly<Record<string, TopicNotes>> = {
  "t-rust-async": {
    keyIdeas: [
      "Calling an async fn builds a future; nothing runs until it's polled by .await or an executor.",
      "A std MutexGuard isn't Send, so it can't be held across an .await on a multi-threaded runtime.",
      "A parked task keeps any lock it holds, so other tasks stall behind it.",
      "Pin means the value won't move again, which keeps self-references inside async state machines valid.",
    ],
    misconception: "Awaiting doesn't release a lock; the guard lives until it's dropped.",
    practice: ["Why does tokio::spawn make a future run when calling the async fn alone doesn't?", "When is tokio::sync::Mutex the right choice over std::sync::Mutex?"],
  },
  "t-decay": {
    keyIdeas: [
      "Decay is keyed off when you said something, never when it was imported.",
      "Each mention adds to the score; the score halves every half-life without one.",
    ],
    misconception: "Import time isn't a proxy for interest; a bulk export would make old ideas look hot.",
    practice: ["What would the map look like after a big import if decay used import time?"],
  },
  "t-systems-book": {
    keyIdeas: ["A stock changes only through its flows.", "A constant fractional outflow produces exponential decay; the half-life sets its rate."],
    misconception: "The half-life sets the drain rate, not a ceiling on the stock.",
    practice: ["Draw the decay score as a stock-and-flow diagram from memory."],
  },
  "t-robot-arm": {
    keyIdeas: [
      "Jitter that tracks another joint's movement points at the shared power rail, not the signal.",
      "Servo inrush current can sag a shared supply enough to brown out its neighbours.",
      "Fixes: a bulk capacitor at the servo header, and a separate supply for the servos.",
    ],
    misconception: "A noisy signal would jitter all the time, not only when the elbow moves.",
    practice: ["How would you confirm with a multimeter or scope that the rail is sagging?"],
  },
  "t-neural-map": {
    keyIdeas: ["The graph is navigation; reading the excerpts where ideas met is the product.", "Parked topics return on a check-in date; dead ones stop resurfacing."],
    misconception: "The map's value isn't the layout but what clicking an edge shows you.",
    practice: ["Explain to a friend in two sentences why the graph alone isn't the product."],
  },
};

interface WeekSeed {
  readonly back: number;
  readonly ideas: number;
  readonly topics: number;
  readonly top: readonly string[];
}

const WEEK_SEEDS: readonly WeekSeed[] = [
  { back: 0, ideas: 4, topics: 2, top: ["t-neural-map", "t-decay"] },
  { back: 1, ideas: 46, topics: 7, top: ["t-rust-async", "t-decay", "t-robot-arm"] },
  { back: 2, ideas: 38, topics: 6, top: ["t-internships", "t-neural-map", "t-systems-book"] },
  { back: 3, ideas: 22, topics: 5, top: ["t-robot-arm", "t-paper-theme", "t-homelab"] },
  { back: 4, ideas: 0, topics: 0, top: [] },
  { back: 5, ideas: 31, topics: 6, top: ["t-study-app", "t-internships", "t-sleep"] },
];

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

function localDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Weeks newest first; MOCK_NOW is a Monday, so it starts the current week. */
export function mockWeeks(): readonly ReviewWeek[] {
  return WEEK_SEEDS.map((w) => {
    const monday = MOCK_NOW - w.back * 7 * DAY_MS;
    const ideas = Math.min(w.ideas, MAX_IDEAS);
    return {
      weekOf: localDate(monday),
      lastDay: localDate(monday + 6 * DAY_MS),
      isCurrent: w.back === 0,
      ideaCount: w.ideas,
      topicCount: w.topics,
      topTopics: w.top.map((id) => findTopic(id)?.title ?? id),
      canReview: w.ideas >= MIN_IDEAS,
      plannedMcq: clamp(Math.floor(ideas / 2), 4, 10),
      plannedFrq: clamp(Math.floor(ideas / 12), 2, 4),
      latest: null,
    };
  });
}
