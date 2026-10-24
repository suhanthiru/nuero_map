import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import { CalendarDays, File, FileInput, FileText, GitMerge, GraduationCap, Settings, Waypoints, type LucideIcon } from "lucide-react";
import { call } from "../../api/api";
import type { TopicSummary, VaultNoteSummary } from "../../api/contract";
import { useNoteIndex } from "../vault/queries";
import type { View } from "./model/tabs";

export const ALL_TOPICS_LIMIT = 5000;

/** Every topic, shared by the explorer, tab titles and the quick switcher. */
export function useAllTopics() {
  return useQuery({
    queryKey: ["topics", "all"],
    queryFn: () => call("list_topics", { filter: { limit: ALL_TOPICS_LIMIT, sort: "name" } }),
  });
}

export function useTopicIndex(): ReadonlyMap<string, TopicSummary> {
  const topics = useAllTopics();
  return new Map((topics.data ?? []).map((t) => [t.id, t]));
}

const STATIC: Readonly<Record<Exclude<View["kind"], "topic" | "note">, { title: string; icon: LucideIcon }>> = {
  today: { title: "Today", icon: CalendarDays },
  graph: { title: "Graph view", icon: Waypoints },
  import: { title: "Import", icon: FileInput },
  settings: { title: "Settings", icon: Settings },
  merges: { title: "Merge suggestions", icon: GitMerge },
  review: { title: "Weekly review", icon: GraduationCap },
};

/** Topics are pages of text; your own notes are plain files, as in a notes app. */
export function viewIcon(view: View): LucideIcon {
  if (view.kind === "topic") return FileText;
  if (view.kind === "note") return File;
  return STATIC[view.kind].icon;
}

export function viewTitle(view: View, topics: ReadonlyMap<string, TopicSummary>, notes?: ReadonlyMap<string, VaultNoteSummary>): string {
  if (view.kind === "topic") return topics.get(view.topicId)?.title ?? "Topic";
  if (view.kind === "note") return notes?.get(view.noteId)?.title ?? "Note";
  return STATIC[view.kind].title;
}

/** `viewTitle` with the topic and note lists already in hand. */
export function useViewTitle(): (view: View) => string {
  const topics = useTopicIndex();
  const notes = useNoteIndex();
  // The maps are rebuilt each render; the callback only needs to be as stable as they are.
  return useCallback((view: View) => viewTitle(view, topics, notes), [topics, notes]);
}
