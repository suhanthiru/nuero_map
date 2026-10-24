import { create } from "zustand";
import type { JobFinished, JobId, JobProgress, JobView } from "../../api/contract";

/**
 * Keyed by pipeline (rootJobId): the latest progress of any job in the pipeline, and
 * the finish event once the whole pipeline is done or has failed.
 */
interface JobState {
  readonly pipelines: Readonly<Record<JobId, JobProgress>>;
  readonly finished: Readonly<Record<JobId, JobFinished>>;
  applyProgress: (progress: JobProgress) => void;
  applyFinished: (finished: JobFinished) => void;
  hydrate: (views: readonly JobView[]) => void;
  clear: (rootJobId: JobId) => void;
}

const TERMINAL = new Set(["done", "failed"]);

/**
 * Keeps the pipeline's root kind when a later event leaves it out: from the event, the
 * pipeline's earlier progress, or the job itself when it is the root.
 */
export function withRootKind(progress: JobProgress, prev?: JobProgress): JobProgress {
  const rootKind = progress.rootKind ?? prev?.rootKind ?? (progress.jobId === progress.rootJobId ? progress.kind : undefined);
  return rootKind ? { ...progress, rootKind } : progress;
}

export const useJobStore = create<JobState>((set) => ({
  pipelines: {},
  finished: {},
  applyProgress: (progress) =>
    set((s) => ({
      pipelines: { ...s.pipelines, [progress.rootJobId]: withRootKind(progress, s.pipelines[progress.rootJobId]) },
    })),
  applyFinished: (finished) =>
    set((s) =>
      finished.pipelineDone ? { finished: { ...s.finished, [finished.rootJobId]: finished } } : s,
    ),
  hydrate: (views) =>
    set((s) => {
      const open = views.filter((v) => v.status === "queued" || v.status === "running");
      const pipelines = Object.fromEntries(open.map((v) => [v.rootJobId, withRootKind(v)]));
      return { pipelines: { ...pipelines, ...s.pipelines } };
    }),
  clear: (rootJobId) =>
    set((s) => {
      const { [rootJobId]: _progress, ...pipelines } = s.pipelines;
      const { [rootJobId]: _finished, ...finished } = s.finished;
      return { pipelines, finished };
    }),
}));

/** Pipelines still in flight, oldest update first. */
export function runningPipelines(
  pipelines: Readonly<Record<JobId, JobProgress>>,
  finished: Readonly<Record<JobId, JobFinished>>,
): JobProgress[] {
  return Object.values(pipelines)
    .filter((p) => !TERMINAL.has(p.stage) && !finished[p.rootJobId])
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
}

