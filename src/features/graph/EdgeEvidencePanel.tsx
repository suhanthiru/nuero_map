import { userMessageOf } from "../../api/errors";
import { ExcerptBlock } from "../../shared/excerpt/ExcerptBlock";
import { StateGlyph } from "../../shared/ui/StateGlyph";
import { useSourceDrawer } from "../source/sourceDrawerStore";
import { NoteLinkList } from "../topic/NoteLinkList";
import { EDGE_KIND_LABEL } from "./model/describe";
import { useEdgeEvidence } from "./queries";
import s from "./Graph.module.css";

const STRENGTH_STEPS = 5;

/** "Click an edge → see the excerpts where two ideas touched." */
export function EdgeEvidencePanel({ edgeId, onBack, onClose }: { readonly edgeId: string; readonly onBack: (() => void) | null; readonly onClose: () => void }) {
  const evidence = useEdgeEvidence(edgeId);
  const openSource = useSourceDrawer((st) => st.open);
  const data = evidence.data;
  const filled = data ? Math.max(1, Math.round(data.edge.strength * STRENGTH_STEPS)) : 0;

  return (
    <section className={s.panel} aria-label="Connection evidence">
      <button type="button" className={s.panelClose} onClick={onClose} aria-label="Close connection">
        ×
      </button>
      {onBack && (
        <button type="button" className={s.panelBack} onClick={onBack}>
          ← Back to topic
        </button>
      )}
      {evidence.isPending && <p className={s.panelSummary}>Loading excerpts…</p>}
      {evidence.error && <p className={s.panelSummary}>{userMessageOf(evidence.error)}</p>}
      {data && (
        <>
          <p className={s.panelEyebrow}>Connection · {EDGE_KIND_LABEL[data.edge.kind]}</p>
          <h2 className={s.panelTitle}>
            <span>
              <StateGlyph state={data.topics[0].state} size={11} /> {data.topics[0].title}
            </span>
            <span className={s.join} aria-label="and">
              ↔
            </span>
            <span>
              <StateGlyph state={data.topics[1].state} size={11} /> {data.topics[1].title}
            </span>
          </h2>
          {/* A note-only link has no chat evidence, so there's no strength to show. */}
          {data.edge.kind === "note" ? (
            <p className={s.strength}>
              <span className={s.strengthText}>Linked in your notes; no chat excerpts yet</span>
            </p>
          ) : (
            <p className={s.strength}>
              <span role="img" aria-label={`Strength ${filled} of ${STRENGTH_STEPS}`}>
                {Array.from({ length: STRENGTH_STEPS }, (_, i) => (
                  <span key={i} className={i < filled ? s.strengthOn : s.strengthOff} />
                ))}
              </span>
              <span className={s.strengthText}>{data.excerpts.length} excerpts where they met</span>
            </p>
          )}
          {data.noteLinks && data.noteLinks.length > 0 && (
            <div className={s.noteLinks}>
              <NoteLinkList links={data.noteLinks} />
            </div>
          )}
          <ol className={s.excerpts}>
            {data.excerpts.map((x) => (
              <li key={`${x.source.messageId}-${x.text.slice(0, 12)}`}>
                <ExcerptBlock excerpt={x} onOpenSource={openSource} clampLines={6} />
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
