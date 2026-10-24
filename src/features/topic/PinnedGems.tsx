import { Quote } from "lucide-react";
import type { Gem } from "../../api/contract";
import { CopyButton } from "../../shared/excerpt/CopyButton";
import { ExcerptBlock } from "../../shared/excerpt/ExcerptBlock";
import { useSourceDrawer } from "../source/sourceDrawerStore";
import { useUnpinGem } from "./queries";
import { Section } from "./Section";
import s from "./TopicPage.module.css";

/** Verbatim quotes worth keeping, each in a quote callout. Never summarized. */
export function PinnedGems({ topicId, gems }: { readonly topicId: string; readonly gems: readonly Gem[] }) {
  const unpin = useUnpinGem(topicId);
  const openSource = useSourceDrawer((st) => st.open);
  return (
    <Section title="Pinned quotes" outline="gems">
      {gems.length === 0 && <p className={s.muted}>Pin a quote from the timeline to keep it here word for word.</p>}
      <ul className={s.gems}>
        {gems.map((g) => (
          <li key={g.id} className={`${s.callout} ${s.gem}`} data-callout="quote">
            <div className={s.calloutTitle}>
              <Quote size={16} aria-hidden /> Quote
            </div>
            <div className={s.calloutBody}>
              <ExcerptBlock excerpt={g.excerpt} onOpenSource={openSource} />
              <div className={s.entryActions}>
                <CopyButton text={g.excerpt.text} label="Copy" />
                <button type="button" className={s.inlineLink} onClick={() => unpin.mutate(g.id)}>
                  Unpin
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}
