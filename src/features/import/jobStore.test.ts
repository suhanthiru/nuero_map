import { beforeEach, describe, expect, it } from "vitest";
import type { JobFinished, JobProgress, JobView } from "../../api/contract";
import { runningPipelines, useJobStore, withRootKind } from "./jobStore";

function progress(jobId: string, rootJobId: string, stage: JobProgress["stage"], updatedAt: string): JobProgress {
  return { jobId, rootJobId, kind: "import", stage, done: 1, total: 2, updatedAt };
}

function finished(rootJobId: string, pipelineDone: boolean, ok = true): JobFinished {
  return { jobId: rootJobId, rootJobId, kind: "import", ok, pipelineDone };
}

describe("jobStore", () => {
  beforeEach(() => useJobStore.setState({ pipelines: {}, finished: {} }));

  it("keeps the latest progress per pipeline, whichever job reported it", () => {
    const before = useJobStore.getState().pipelines;

    useJobStore.getState().applyProgress(progress("1", "1", "parsing", "2026-01-01T00:00:00Z"));
    useJobStore.getState().applyProgress(progress("2", "1", "extracting", "2026-01-01T00:01:00Z"));

    expect(before).toEqual({});
    expect(Object.keys(useJobStore.getState().pipelines)).toEqual(["1"]);
    expect(useJobStore.getState().pipelines["1"].stage).toBe("extracting");
  });

  it("records a finish only when the whole pipeline is done", () => {
    useJobStore.getState().applyFinished(finished("1", false));
    expect(useJobStore.getState().finished).toEqual({});

    useJobStore.getState().applyFinished(finished("1", true));
    expect(useJobStore.getState().finished["1"].ok).toBe(true);
  });

  it("hydrates open jobs from list_jobs without overwriting live progress", () => {
    useJobStore.getState().applyProgress(progress("5", "5", "embedding", "2026-01-01T00:05:00Z"));
    const views: JobView[] = [
      { ...progress("5", "5", "parsing", "2026-01-01T00:00:00Z"), status: "running", error: null, errorCode: null },
      { ...progress("7", "7", "parsing", "2026-01-01T00:00:00Z"), status: "queued", error: null, errorCode: null },
      { ...progress("3", "3", "done", "2026-01-01T00:00:00Z"), status: "done", error: null, errorCode: null },
    ];

    useJobStore.getState().hydrate(views);

    const { pipelines } = useJobStore.getState();
    expect(Object.keys(pipelines).sort()).toEqual(["5", "7"]);
    expect(pipelines["5"].stage).toBe("embedding");
  });

  it("clears a pipeline from both maps", () => {
    useJobStore.getState().applyProgress(progress("1", "1", "parsing", "2026-01-01T00:00:00Z"));
    useJobStore.getState().applyFinished(finished("1", true));

    useJobStore.getState().clear("1");

    expect(useJobStore.getState().pipelines).toEqual({});
    expect(useJobStore.getState().finished).toEqual({});
  });

  it("lists only unfinished pipelines, oldest first", () => {
    const pipelines = {
      b: progress("b", "b", "embedding", "2026-01-01T00:02:00Z"),
      a: progress("a", "a", "parsing", "2026-01-01T00:01:00Z"),
      c: progress("c", "c", "done", "2026-01-01T00:00:00Z"),
      d: progress("d", "d", "extracting", "2026-01-01T00:00:00Z"),
    };

    expect(runningPipelines(pipelines, { d: finished("d", true, false) }).map((j) => j.jobId)).toEqual(["a", "b"]);
  });

  it("remembers the pipeline's root kind when later jobs leave it out", () => {
    const root: JobProgress = { ...progress("1", "1", "parsing", "2026-01-01T00:00:00Z"), kind: "capture" };
    const child: JobProgress = { ...progress("2", "1", "assigning", "2026-01-01T00:01:00Z"), kind: "assign" };

    useJobStore.getState().applyProgress(root);
    useJobStore.getState().applyProgress(child);

    expect(useJobStore.getState().pipelines["1"]).toMatchObject({ kind: "assign", rootKind: "capture" });
  });

  it("takes the root kind from the event first, then the job itself when it is the root", () => {
    const child = progress("2", "1", "linking", "2026-01-01T00:00:00Z");

    expect(withRootKind({ ...child, rootKind: "capture" }).rootKind).toBe("capture");
    expect(withRootKind(child).rootKind).toBeUndefined();
    expect(withRootKind(progress("1", "1", "parsing", "2026-01-01T00:00:00Z")).rootKind).toBe("import");
  });

  it("fills in the root kind of hydrated jobs", () => {
    const view: JobView = { ...progress("9", "9", "parsing", "2026-01-01T00:00:00Z"), kind: "capture", status: "running", error: null, errorCode: null };

    useJobStore.getState().hydrate([view]);

    expect(useJobStore.getState().pipelines["9"].rootKind).toBe("capture");
  });
});
