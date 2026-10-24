import type { Idea } from "../../../api/contract";
import { noteHeadings } from "./note";
import { buildTimeline } from "./timeline";

export interface OutlineItem {
  readonly label: string;
  /** Matches a `data-outline` attribute on the topic page. */
  readonly section: string;
  /** 0 for page sections; note headings and months nest under theirs. */
  readonly depth: number;
}

/** A note page: the headings the user wrote, nested by level. */
export function noteOutline(body: string): OutlineItem[] {
  const headings = noteHeadings(body);
  const top = Math.min(...headings.map((h) => h.level));
  return headings.map((h) => ({ label: h.text, section: `note-L${h.line}`, depth: h.level - top }));
}

/** Topic page headings in page order, including the headings the user wrote in their note. */
export function topicOutline(ideas: readonly Idea[], noteBody: string): OutlineItem[] {
  const headings = noteHeadings(noteBody);
  const top = Math.min(...headings.map((h) => h.level));
  return [
    { label: "Current state", section: "state", depth: 0 },
    { label: "My notes", section: "notes", depth: 0 },
    ...headings.map((h) => ({ label: h.text, section: `note-L${h.line}`, depth: 1 + h.level - top })),
    { label: "Pinned quotes", section: "gems", depth: 0 },
    { label: "Timeline", section: "timeline", depth: 0 },
    ...buildTimeline(ideas).map((m) => ({ label: m.label, section: `m-${m.key}`, depth: 1 })),
    { label: "Linked mentions", section: "connections", depth: 0 },
    { label: "Unlinked mentions", section: "unlinked", depth: 0 },
  ];
}
