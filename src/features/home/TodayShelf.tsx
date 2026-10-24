import type { MouseEvent } from "react";
import type { ShelfCard as Card, ShelfReason } from "../../api/contract";
import { userMessageOf } from "../../api/errors";
import { relativeDays } from "../../shared/format/dates";
import { StateGlyph } from "../../shared/ui/StateGlyph";
import { useOpen } from "../workspace/useOpen";
import { useTodayShelf } from "./queries";
import s from "./Home.module.css";

const REASON: Readonly<Record<ShelfReason, { eyebrow: string; mark: string; hint: string }>> = {
  fading: { eyebrow: "Hot but fading", mark: "◔", hint: "You were deep in this recently. Still on your mind?" },
  parked: { eyebrow: "From the shelf", mark: "⏸", hint: "Parked a while ago. Pick it back up, or let it rest." },
  newConnection: { eyebrow: "New connection", mark: "⤳", hint: "Something you said linked two ideas." },
};

function ShelfCard({ card }: { readonly card: Card }) {
  const { openTopic } = useOpen();
  const meta = REASON[card.reason];
  const open = (id: string, e: MouseEvent) => openTopic(id, e);
  return (
    <article className={s.shelfCard} data-reason={card.reason}>
      <p className={s.shelfEyebrow}>
        <span aria-hidden>{meta.mark}</span> {meta.eyebrow}
      </p>
      <h3 className={s.shelfTitle}>
        <button type="button" className={s.shelfOpen} onClick={(e) => open(card.topic.id, e)} onAuxClick={(e) => open(card.topic.id, e)}>
          <StateGlyph state={card.topic.state} size={12} /> {card.topic.title}
        </button>
      </h3>
      {card.relatedTopic && (
        <p className={s.shelfRelated}>
          <span aria-hidden>↔</span>{" "}
          <button type="button" className={s.linkish} onClick={(e) => card.relatedTopic && open(card.relatedTopic.id, e)}>
            {card.relatedTopic.title}
          </button>
        </p>
      )}
      <p className={s.shelfDetail}>{card.detail}</p>
      <p className={s.shelfSummary}>{card.topic.summary}</p>
      <div className={s.shelfFoot}>
        <span className={s.meter} aria-label={`${Math.round(card.topic.decay * 100)} percent alive`}>
          <span style={{ width: `${Math.round(card.topic.decay * 100)}%` }} />
        </span>
        <span className={s.footText}>
          {card.topic.ideaCount} ideas · {relativeDays(card.topic.lastActiveAt)}
        </span>
      </div>
      <p className="visually-hidden">{meta.hint}</p>
    </article>
  );
}

export function TodayShelf() {
  const shelf = useTodayShelf();
  return (
    <section aria-labelledby="shelf-heading" className={s.section}>
      <h2 id="shelf-heading" className={s.sectionTitle}>
        Three to revisit today
      </h2>
      {shelf.isPending && <p className={s.muted}>Picking today's three…</p>}
      {shelf.error && <p className={s.muted}>{userMessageOf(shelf.error)}</p>}
      {shelf.data && shelf.data.cards.length === 0 && (
        <p className={s.muted}>Nothing to resurface yet. Import a chat export and come back tomorrow.</p>
      )}
      <div className={s.shelf}>
        {shelf.data?.cards.map((c) => <ShelfCard key={`${c.reason}-${c.topic.id}`} card={c} />)}
      </div>
    </section>
  );
}
