import { useEffect, useRef } from "react";
import { ALL_TOPICS_LIMIT, useAllTopics } from "./viewMeta";
import { useWorkspace } from "./workspaceStore";

/**
 * When a topic disappears from the topic list (merged into another, or deleted), its tabs
 * close. Only topics seen before and now gone count: a tab for an id the list never had
 * keeps showing its "couldn't open" message, and a list cut off at the limit proves nothing.
 */
export function usePruneVanishedTopics(): void {
  const topics = useAllTopics();
  const prune = useWorkspace((st) => st.pruneTopics);
  const known = useRef<ReadonlySet<string> | null>(null);

  useEffect(() => {
    const list = topics.data;
    if (!list || list.length >= ALL_TOPICS_LIMIT) return;
    const now = new Set(list.map((t) => t.id));
    const before = known.current;
    known.current = now;
    if (!before) return;
    const vanished = [...before].filter((id) => !now.has(id));
    if (vanished.length === 0) return;
    const gone = new Set(vanished);
    prune((id) => !gone.has(id));
  }, [topics.data, prune]);
}
