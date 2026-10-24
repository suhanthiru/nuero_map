import { useState } from "react";
import type { ImportEstimate, ImportSource, JobFinished, JobId } from "../../api/contract";
import { USER_MESSAGES, userMessageOf } from "../../api/errors";
import { Button } from "../../shared/ui/Button";
import { Page } from "../../shared/ui/Page";
import { SegmentedControl } from "../../shared/ui/SegmentedControl";
import { useOpen } from "../workspace/useOpen";
import { EstimateCard } from "./EstimateCard";
import { ProgressStages } from "./ProgressStages";
import { ZipPicker } from "./ZipPicker";
import { useJobStore } from "./jobStore";
import { useCancelJob, useEstimateImport, useStartImport } from "./queries";
import s from "./ImportPage.module.css";

const SOURCE_OPTIONS: readonly { value: ImportSource; label: string }[] = [
  { value: "auto", label: "Detect" },
  { value: "claude", label: "Claude" },
  { value: "chatgpt", label: "ChatGPT" },
];

function outcomeText(finished: JobFinished): string {
  if (finished.ok) return "Import finished. New topics will show up on Today and in the graph.";
  if (finished.errorCode === "cancelled") return "Import cancelled. Anything already stored is kept.";
  return USER_MESSAGES[finished.errorCode ?? ""] ?? finished.error ?? "Import failed.";
}

function expectedFrom(estimate: ImportEstimate | undefined): number | null {
  return estimate ? estimate.conversations : null;
}

/** Gemini chats arrive through the browser extension instead of a zip. */
function GeminiHint() {
  const { open } = useOpen();
  return (
    <p className={s.hint}>
      Gemini has no export file.{" "}
      <button type="button" className={s.linkish} onClick={(e) => open({ kind: "settings" }, e)}>
        Pair the browser extension in Settings
      </button>{" "}
      to capture chats as you go.
    </p>
  );
}

export function ImportPage() {
  const [path, setPath] = useState<string | null>(null);
  const [source, setSource] = useState<ImportSource>("auto");
  const [jobId, setJobId] = useState<JobId | null>(null);
  const estimate = useEstimateImport();
  const start = useStartImport();
  const cancel = useCancelJob();
  const progress = useJobStore((st) => (jobId ? st.pipelines[jobId] : undefined));
  const finished = useJobStore((st) => (jobId ? st.finished[jobId] : undefined));
  const running = jobId !== null && !finished;

  const pick = (next: string) => {
    setPath(next);
    setJobId(null);
    estimate.mutate({ path: next, source });
  };
  const run = () =>
    path && start.mutate({ path, source, expectedConversations: expectedFrom(estimate.data) }, { onSuccess: setJobId });
  const error = estimate.error ?? start.error;

  return (
    <Page eyebrow="Import" title="Bring in a chat export">
      <p className={s.lede}>
        Export your history from Claude (Settings → Privacy → Export data) or ChatGPT (Settings → Data controls →
        Export), then pick the zip. Re-importing a newer export only processes new or changed chats.
      </p>
      <div className={s.controls}>
        <SegmentedControl label="Export source" options={SOURCE_OPTIONS} value={source} onChange={setSource} disabled={running} />
        <ZipPicker path={path} onPick={pick} disabled={running} />
        <GeminiHint />
      </div>
      {estimate.isPending && <p className={s.muted}>Reading the export…</p>}
      {error && (
        <p className={s.error} role="alert">
          {userMessageOf(error)}
        </p>
      )}
      {estimate.data && <EstimateCard estimate={estimate.data} onRun={run} running={running || start.isPending} />}
      {jobId && <ProgressStages progress={progress} failed={finished?.ok === false} />}
      {running && jobId && (
        <Button variant="ghost" size="sm" onClick={() => cancel.mutate(jobId)} disabled={cancel.isPending}>
          Cancel import
        </Button>
      )}
      {finished && (
        <p className={finished.ok ? s.done : s.error} role="status">
          {outcomeText(finished)}
        </p>
      )}
    </Page>
  );
}
