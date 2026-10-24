import type { JobProgress, JobStage } from "../../../api/contract";

/** The four stages shown on the import screen, in order. */
export const IMPORT_STEPS = ["parsing", "extracting", "embedding", "assigning"] as const satisfies readonly JobStage[];
export type ImportStep = (typeof IMPORT_STEPS)[number];

const LABELS: Readonly<Record<JobStage, string>> = {
  queued: "Queued",
  parsing: "Parsing export",
  extracting: "Extracting ideas",
  embedding: "Embedding",
  assigning: "Assigning topics",
  linking: "Linking topics",
  synthesizing: "Writing synthesis",
  done: "Done",
  failed: "Failed",
};

export function stageLabel(stage: JobStage): string {
  return LABELS[stage];
}

/** Work the browser extension started: Gemini turns captured as you chat, not an import. */
export function isCapturePipeline(progress: Pick<JobProgress, "rootKind">): boolean {
  return progress.rootKind === "capture";
}

/** Status-bar text for background work. Review jobs are one step, so no counts. */
export function pipelineLabel(progress: JobProgress): string {
  if (isCapturePipeline(progress)) return "Processing Gemini chats";
  if (progress.kind === "review") return `Weekly review: ${progress.message ?? "working"}`;
  return `${stageLabel(progress.stage)} ${progress.done.toLocaleString()}/${progress.total.toLocaleString()}`;
}

export type StepStatus = "pending" | "running" | "done" | "failed";

const ORDER: readonly JobStage[] = ["queued", ...IMPORT_STEPS, "linking", "done"];

/**
 * Status of one import step given the pipeline's latest progress. `failed` comes from
 * job_finished: the step that was running when it failed is marked failed.
 */
export function stepStatus(step: ImportStep, progress: JobProgress | undefined, failed = false): StepStatus {
  if (progress?.stage === "failed") return "failed";
  if (!progress) return failed && step === IMPORT_STEPS[0] ? "failed" : "pending";
  const current = ORDER.indexOf(progress.stage);
  const target = ORDER.indexOf(step);
  if (current > target) return "done";
  if (current === target) return failed ? "failed" : "running";
  return "pending";
}

/** 0..100, clamped; 0 when total is unknown. */
export function percent(progress: Pick<JobProgress, "done" | "total">): number {
  if (progress.total <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((progress.done / progress.total) * 100)));
}
