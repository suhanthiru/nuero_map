import { describe, expect, it } from "vitest";
import type { JobProgress, JobStage } from "../../../api/contract";
import { IMPORT_STEPS, isCapturePipeline, percent, pipelineLabel, stageLabel, stepStatus } from "./stages";

function progress(stage: JobStage, done = 0, total = 10): JobProgress {
  return { jobId: "j", rootJobId: "j", kind: "import", stage, done, total, updatedAt: "2026-09-28T00:00:00Z" };
}

describe("stepStatus", () => {
  it("is pending for every step before a job starts", () => {
    expect(IMPORT_STEPS.map((s) => stepStatus(s, undefined))).toEqual(["pending", "pending", "pending", "pending"]);
  });

  it("marks earlier steps done, the current step running, later steps pending", () => {
    const p = progress("embedding");

    expect(IMPORT_STEPS.map((s) => stepStatus(s, p))).toEqual(["done", "done", "running", "pending"]);
  });

  it("marks all steps done once the job reaches linking or done", () => {
    expect(IMPORT_STEPS.every((s) => stepStatus(s, progress("linking")) === "done")).toBe(true);
    expect(IMPORT_STEPS.every((s) => stepStatus(s, progress("done")) === "done")).toBe(true);
  });

  it("marks steps failed when the job failed", () => {
    expect(stepStatus("parsing", progress("failed"))).toBe("failed");
  });
});

describe("percent", () => {
  it("rounds and clamps to 0..100", () => {
    expect(percent({ done: 1, total: 3 })).toBe(33);
    expect(percent({ done: 12, total: 10 })).toBe(100);
    expect(percent({ done: -1, total: 10 })).toBe(0);
  });

  it("returns 0 when the total is unknown", () => {
    expect(percent({ done: 5, total: 0 })).toBe(0);
  });
});

describe("stageLabel", () => {
  it("has a human label for every stage", () => {
    expect(stageLabel("extracting")).toBe("Extracting ideas");
    expect(stageLabel("failed")).toBe("Failed");
  });
});

describe("stepStatus with a failed pipeline", () => {
  it("marks only the step that was running as failed", () => {
    const p = progress("extracting");

    expect(IMPORT_STEPS.map((s) => stepStatus(s, p, true))).toEqual(["done", "failed", "pending", "pending"]);
  });

  it("marks the first step failed when the job failed before reporting progress", () => {
    expect(IMPORT_STEPS.map((s) => stepStatus(s, undefined, true))).toEqual(["failed", "pending", "pending", "pending"]);
  });
});

describe("pipelineLabel", () => {
  it("shows the stage and counts for an import", () => {
    expect(pipelineLabel(progress("extracting", 3, 10))).toBe("Extracting ideas 3/10");
  });

  it("names captured Gemini chats instead of import stages", () => {
    const capture: JobProgress = { ...progress("assigning", 1, 2), kind: "assign", rootKind: "capture" };

    expect(isCapturePipeline(capture)).toBe(true);
    expect(isCapturePipeline(progress("assigning"))).toBe(false);
    expect(pipelineLabel(capture)).toBe("Processing Gemini chats");
  });

  it("describes a weekly review by its message", () => {
    expect(pipelineLabel({ ...progress("synthesizing"), kind: "review", message: "writing" })).toBe("Weekly review: writing");
    expect(pipelineLabel({ ...progress("synthesizing"), kind: "review" })).toBe("Weekly review: working");
  });
});
