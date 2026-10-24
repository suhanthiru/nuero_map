import { useEffect } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { call, subscribe } from "../../api/api";
import type { Unlisten } from "../../api/transport";
import { useJobStore } from "./jobStore";

/** Query keys refreshed whenever a pipeline finishes, topics change or a chat is captured. */
const DATA_KEYS = [["graph"], ["topics"], ["topicPage"], ["unlinkedMentions"], ["shelf"], ["merges"], ["review"]] as const;

export function invalidateData(queryClient: QueryClient): void {
  DATA_KEYS.forEach((queryKey) => queryClient.invalidateQueries({ queryKey }));
}

/**
 * Mount once (StatusBar): mirrors backend job events into the job store, refreshes
 * data when work lands, and hydrates in-flight jobs on launch (e.g. after a crash).
 */
export function useJobEvents(): void {
  const queryClient = useQueryClient();
  const applyProgress = useJobStore((s) => s.applyProgress);
  const applyFinished = useJobStore((s) => s.applyFinished);
  const hydrate = useJobStore((s) => s.hydrate);

  useEffect(() => {
    const invalidateAll = () => invalidateData(queryClient);
    const pending: Promise<Unlisten>[] = [
      subscribe("job_progress", applyProgress),
      subscribe("job_finished", (finished) => {
        applyFinished(finished);
        if (finished.pipelineDone) invalidateAll();
      }),
      subscribe("topics_changed", invalidateAll),
    ];
    call("list_jobs", {}).then(hydrate, () => undefined);
    return () => {
      pending.forEach((p) => p.then((unlisten) => unlisten()).catch(() => undefined));
    };
  }, [queryClient, applyProgress, applyFinished, hydrate]);
}
