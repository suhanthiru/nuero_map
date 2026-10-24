import type { JobProgress } from "../../api/contract";
import { formatCount } from "../../shared/format/numbers";
import { IMPORT_STEPS, percent, stageLabel, stepStatus, type StepStatus } from "./model/stages";
import s from "./ImportPage.module.css";

const STATUS_GLYPH: Readonly<Record<StepStatus, string>> = {
  pending: "○",
  running: "◐",
  done: "●",
  failed: "×",
};

interface Props {
  readonly progress: JobProgress | undefined;
  readonly failed?: boolean;
}

export function ProgressStages({ progress, failed = false }: Props) {
  return (
    <ol className={s.steps} aria-label="Import progress">
      {IMPORT_STEPS.map((step) => {
        const status = stepStatus(step, progress, failed);
        const live = status === "running" && progress;
        return (
          <li key={step} className={s.step} data-status={status}>
            <span className={s.glyph} aria-hidden>
              {STATUS_GLYPH[status]}
            </span>
            <span className={s.stepLabel}>{stageLabel(step)}</span>
            <span className={s.stepCount}>
              {live ? `${formatCount(progress.done)} / ${formatCount(progress.total)}` : status === "done" ? "done" : ""}
            </span>
            {live && (
              <span className={s.bar} aria-hidden>
                <span className={s.barFill} style={{ width: `${percent(progress)}%` }} />
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
