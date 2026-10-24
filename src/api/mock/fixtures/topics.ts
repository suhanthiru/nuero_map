import type { TopicState, TopicSummary } from "../../contract";
import { daysAgo } from "../rng";

interface Seed {
  readonly id: string;
  readonly title: string;
  readonly aliases: readonly string[];
  readonly state: TopicState;
  readonly decay: number;
  readonly ideaCount: number;
  readonly summary: string;
  readonly ageDays: number;
  readonly lastDays: number;
}

const SEEDS: readonly Seed[] = [
  { id: "t-neural-map", title: "Neural map of my chats", aliases: ["idea graph", "second brain"], state: "active", decay: 0.96, ideaCount: 41, summary: "A desktop app that turns Claude, ChatGPT and Gemini history into a living idea graph.", ageDays: 21, lastDays: 0 },
  { id: "t-decay", title: "Decay scoring for ideas", aliases: ["half-life", "fading shelf"], state: "active", decay: 0.82, ideaCount: 17, summary: "Size nodes by recency times revisits so fading ideas can be resurfaced on purpose.", ageDays: 19, lastDays: 1 },
  { id: "t-paper-theme", title: "Zed-style paper theme", aliases: ["rust and paper"], state: "active", decay: 0.64, ideaCount: 9, summary: "Warm paper, ink and rust; typographic rather than neon-network.", ageDays: 18, lastDays: 3 },
  { id: "t-wispr", title: "Capturing Wispr Flow notes", aliases: ["voice notes"], state: "parked", decay: 0.31, ideaCount: 6, summary: "Dictated notes as a fourth source, deferred until the core loop works.", ageDays: 20, lastDays: 12 },
  { id: "t-robot-arm", title: "Robot arm side project", aliases: ["servo arm", "inverse kinematics"], state: "active", decay: 0.58, ideaCount: 23, summary: "A 4-DOF desk arm; stuck on smoothing servo jitter and IK for the wrist.", ageDays: 140, lastDays: 4 },
  { id: "t-rust-async", title: "Learning async Rust", aliases: ["tokio"], state: "active", decay: 0.49, ideaCount: 14, summary: "Working through tokio, pinning and why holding a mutex across await is a trap.", ageDays: 60, lastDays: 6 },
  { id: "t-study-app", title: "Study-group matching app", aliases: ["startup idea"], state: "parked", decay: 0.22, ideaCount: 19, summary: "Match classmates by schedule and weak topics; parked after the pricing questions.", ageDays: 210, lastDays: 45 },
  { id: "t-internships", title: "Internship applications", aliases: ["job search", "resume"], state: "active", decay: 0.71, ideaCount: 28, summary: "Tailoring bullets per role and tracking which referrals actually replied.", ageDays: 90, lastDays: 2 },
  { id: "t-sleep", title: "Sleep and focus routine", aliases: ["deep work"], state: "done", decay: 0.18, ideaCount: 8, summary: "Settled on a fixed wake time and no screens after 23:00.", ageDays: 120, lastDays: 60 },
  { id: "t-homelab", title: "Home server with Tailscale", aliases: ["homelab"], state: "parked", decay: 0.27, ideaCount: 11, summary: "Old laptop as a media and backup box reachable over Tailscale.", ageDays: 170, lastDays: 33 },
  { id: "t-systems-book", title: "Thinking in Systems notes", aliases: ["stocks and flows"], state: "active", decay: 0.39, ideaCount: 12, summary: "Stocks, flows and feedback loops; keeps showing up in the decay design.", ageDays: 75, lastDays: 9 },
  { id: "t-cold-brew", title: "Cold brew ratios", aliases: ["coffee"], state: "dead", decay: 0.05, ideaCount: 4, summary: "1:8 concentrate, 16 hours. Nothing left to decide.", ageDays: 300, lastDays: 250 },
];

function toSummary(seed: Seed): TopicSummary {
  return {
    id: seed.id,
    title: seed.title,
    aliases: seed.aliases,
    state: seed.state,
    decay: seed.decay,
    ideaCount: seed.ideaCount,
    summary: seed.summary,
    createdAt: daysAgo(seed.ageDays),
    lastActiveAt: daysAgo(seed.lastDays),
    checkInAt: seed.state === "parked" ? daysAgo(-7) : null,
  };
}

export const MOCK_TOPICS: readonly TopicSummary[] = SEEDS.map(toSummary);

export function findTopic(id: string): TopicSummary | undefined {
  return MOCK_TOPICS.find((t) => t.id === id);
}
