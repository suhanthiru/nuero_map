import type { IsoDateTime, JobId, TopicId } from "./ids";

/** `capture` is the debounced job the capture listener queues once chatting stops. */
export type JobKind =
  | "import"
  | "extract"
  | "poll_batch"
  | "assign"
  | "link"
  | "synthesis"
  | "capture"
  | "review";

export type JobStage =
  | "queued"
  | "parsing"
  | "extracting"
  | "embedding"
  | "assigning"
  | "linking"
  | "synthesizing"
  | "done"
  | "failed";

export interface JobProgress {
  readonly jobId: JobId;
  /** The job this pipeline started from (itself for a top-level job). */
  readonly rootJobId: JobId;
  readonly kind: JobKind;
  /** Kind of the pipeline's root job, e.g. `import` or `capture`. */
  readonly rootKind?: JobKind;
  readonly stage: JobStage;
  readonly done: number;
  readonly total: number;
  readonly message?: string;
  readonly updatedAt: IsoDateTime;
}

export type JobStatus = "queued" | "running" | "done" | "failed" | "cancelled";

/** A job row from list_jobs: progress plus status and the last error. */
export interface JobView extends JobProgress {
  readonly status: JobStatus;
  readonly error: string | null;
  readonly errorCode: string | null;
}

export interface JobFinished {
  readonly jobId: JobId;
  readonly rootJobId: JobId;
  readonly kind: JobKind;
  readonly rootKind?: JobKind;
  readonly ok: boolean;
  readonly error?: string;
  readonly errorCode?: string;
  /** Nothing else in this pipeline is still queued or running. */
  readonly pipelineDone: boolean;
  readonly topicId?: TopicId;
}

export type ImportSource = "claude" | "chatgpt" | "auto";

export interface ImportEstimate {
  readonly path: string;
  readonly detectedSource: "claude" | "chatgpt";
  readonly conversations: number;
  readonly newConversations: number;
  readonly changedConversations: number;
  readonly messages: number;
  readonly estimatedInputTokens: number;
  readonly estimatedOutputTokens: number;
  readonly estimatedCostUsd: number;
  readonly extractionModel: string;
}
