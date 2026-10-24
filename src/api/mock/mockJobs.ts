import type { JobId, JobKind, JobStage } from "../contract";
import { mockEmit } from "./mockEvents";

const IMPORT_STAGES: readonly JobStage[] = ["parsing", "extracting", "embedding", "assigning", "linking"];
const TICK_MS = 350;
const TICKS_PER_STAGE = 6;

let nextId = 1;
const timers = new Map<JobId, ReturnType<typeof setInterval>>();

/** Every mock job is its own pipeline, so its root kind is its own kind. */
function emitProgress(jobId: JobId, kind: JobKind, stage: JobStage, done: number, total: number): void {
  const updatedAt = new Date().toISOString();
  mockEmit("job_progress", { jobId, rootJobId: jobId, kind, rootKind: kind, stage, done, total, updatedAt });
}

function finish(jobId: JobId, kind: JobKind, ok: boolean, errorCode?: string): void {
  clearInterval(timers.get(jobId));
  timers.delete(jobId);
  mockEmit("job_finished", { jobId, rootJobId: jobId, kind, rootKind: kind, ok, errorCode, pipelineDone: true });
}

/**
 * Emits fake job_progress events through every stage, then job_finished. `onDone` runs
 * just before job_finished, where the backend would have written its results.
 */
export function runMockJob(
  kind: JobKind,
  total: number,
  stages: readonly JobStage[] = IMPORT_STAGES,
  onDone?: () => void,
): JobId {
  const jobId = `mock-job-${nextId++}`;
  let tick = 0;
  const timer = setInterval(() => {
    const stageIndex = Math.floor(tick / TICKS_PER_STAGE);
    if (stageIndex >= stages.length) {
      emitProgress(jobId, kind, "done", total, total);
      onDone?.();
      finish(jobId, kind, true);
      return;
    }
    const within = (tick % TICKS_PER_STAGE) + 1;
    emitProgress(jobId, kind, stages[stageIndex], Math.round((within / TICKS_PER_STAGE) * total), total);
    tick += 1;
  }, TICK_MS);
  timers.set(jobId, timer);
  return jobId;
}

/** Stops a running mock job as the backend would on cancel. */
export function cancelMockJob(jobId: JobId): boolean {
  if (!timers.has(jobId)) return false;
  finish(jobId, "import", false, "cancelled");
  return true;
}
