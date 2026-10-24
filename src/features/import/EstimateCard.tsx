import type { ImportEstimate } from "../../api/contract";
import { formatCount, formatUsd } from "../../shared/format/numbers";
import { APP_LABEL } from "../../shared/excerpt/apps";
import { Button } from "../../shared/ui/Button";
import s from "./ImportPage.module.css";

interface Props {
  readonly estimate: ImportEstimate;
  readonly onRun: () => void;
  readonly running: boolean;
}

export function EstimateCard({ estimate, onRun, running }: Props) {
  const work = estimate.newConversations + estimate.changedConversations;
  const nothingToDo = work === 0;
  return (
    <section className={s.card} aria-label="Import estimate">
      <p className={s.cardEyebrow}>{APP_LABEL[estimate.detectedSource]} export</p>
      <dl className={s.stats}>
        <div>
          <dt>Conversations</dt>
          <dd>{formatCount(estimate.conversations)}</dd>
        </div>
        <div>
          <dt>New or changed</dt>
          <dd>{formatCount(work)}</dd>
        </div>
        <div>
          <dt>Messages</dt>
          <dd>{formatCount(estimate.messages)}</dd>
        </div>
        <div>
          <dt>Tokens in / out</dt>
          <dd>
            {formatCount(estimate.estimatedInputTokens)} / {formatCount(estimate.estimatedOutputTokens)}
          </dd>
        </div>
      </dl>
      <div className={s.costRow}>
        <p>
          Estimated extraction cost <strong className={s.cost}>{formatUsd(estimate.estimatedCostUsd)}</strong>
          <span className={s.muted}> with {estimate.extractionModel} (batch pricing)</span>
        </p>
        <Button variant="primary" onClick={onRun} disabled={running || nothingToDo}>
          {nothingToDo ? "Already up to date" : running ? "Importing…" : "Import and extract"}
        </Button>
      </div>
    </section>
  );
}
