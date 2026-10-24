import type { Idea, IdeaKind, SynthesisLine, SourceRef } from "../../../api/contract";

export interface TimelineEntry {
  readonly idea: Idea;
  /** Later ideas that restate this one; collapsed under it. */
  readonly restatements: readonly Idea[];
}

export interface TimelineGroup {
  /** "2026-09" style key and a display label like "September 2026". */
  readonly key: string;
  readonly label: string;
  readonly entries: readonly TimelineEntry[];
}

// The key is a UTC month, so format it in UTC (local time would shift the 1st into the previous month).
const monthLabel = new Intl.DateTimeFormat("en", { month: "long", year: "numeric", timeZone: "UTC" });

function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

/**
 * Newest first, grouped by month. Ideas marked as duplicates of an earlier one are
 * folded under it rather than shown again.
 */
export function buildTimeline(ideas: readonly Idea[]): TimelineGroup[] {
  const ids = new Set(ideas.map((i) => i.id));
  const restated = new Map<string, Idea[]>();
  for (const i of ideas) {
    if (i.duplicateOf && ids.has(i.duplicateOf)) restated.set(i.duplicateOf, [...(restated.get(i.duplicateOf) ?? []), i]);
  }
  const primary = ideas
    .filter((i) => !(i.duplicateOf && ids.has(i.duplicateOf)))
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  const groups = new Map<string, TimelineEntry[]>();
  for (const idea of primary) {
    const key = monthKey(idea.occurredAt);
    const entry = { idea, restatements: restated.get(idea.id) ?? [] };
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }
  return [...groups.entries()].map(([key, entries]) => ({
    key,
    label: monthLabel.format(new Date(`${key}-01T00:00:00Z`)),
    entries,
  }));
}

export const KIND_META: Readonly<Record<IdeaKind, { label: string; mark: string }>> = {
  question: { label: "Question", mark: "?" },
  insight: { label: "Insight", mark: "✦" },
  decision: { label: "Decision", mark: "✓" },
  plan: { label: "Plan", mark: "→" },
  fact: { label: "Fact", mark: "#" },
  problem: { label: "Problem", mark: "!" },
  preference: { label: "Preference", mark: "♡" },
  reference: { label: "Reference", mark: "↗" },
};

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

export interface WeekBucket {
  readonly start: string;
  readonly count: number;
}

/** Ideas per week for the last `weeks` weeks (oldest first), for the activity strip. */
export function weeklyActivity(ideas: readonly Idea[], weeks: number, now: number = Date.now()): WeekBucket[] {
  const end = now;
  const counts = new Array<number>(weeks).fill(0);
  for (const idea of ideas) {
    const age = end - Date.parse(idea.occurredAt);
    if (Number.isNaN(age) || age < 0) continue;
    const index = weeks - 1 - Math.floor(age / WEEK_MS);
    if (index >= 0) counts[index] += 1;
  }
  return counts.map((count, i) => ({ start: new Date(end - (weeks - i) * WEEK_MS).toISOString(), count }));
}

export interface NumberedLine {
  readonly text: string;
  /** Citation numbers shown after the line, and the source each points to. */
  readonly marks: readonly { readonly n: number; readonly source: SourceRef }[];
}

/** Numbers sources across the whole synthesis, so a message cited twice keeps one number. */
export function numberCitations(lines: readonly SynthesisLine[]): { lines: NumberedLine[]; sources: SourceRef[] } {
  const order: SourceRef[] = [];
  const numberOf = new Map<string, number>();
  const numbered = lines.map((line) => ({
    text: line.text,
    marks: line.sources.map((source) => {
      let n = numberOf.get(source.messageId);
      if (n === undefined) {
        order.push(source);
        n = order.length;
        numberOf.set(source.messageId, n);
      }
      return { n, source };
    }),
  }));
  return { lines: numbered, sources: order };
}
