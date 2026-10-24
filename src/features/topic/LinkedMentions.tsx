import { useId, useState, type MouseEvent } from "react";
import { ChevronDown } from "lucide-react";
import type { Connection, TopicSummary } from "../../api/contract";
import { ExcerptBlock } from "../../shared/excerpt/ExcerptBlock";
import { StateGlyph } from "../../shared/ui/StateGlyph";
import { EDGE_KIND_LABEL } from "../graph/model/describe";
import { useSourceDrawer } from "../source/sourceDrawerStore";
import { useOpen } from "../workspace/useOpen";
import { NoteLinkList } from "./NoteLinkList";
import s from "./TopicPage.module.css";

const STRENGTH_STEPS = 5;

function Mention({ topic, connection }: { readonly topic: TopicSummary; readonly connection: Connection }) {
  const [open, setOpen] = useState(true);
  const openSource = useSourceDrawer((st) => st.open);
  const { open: openView, openTopic } = useOpen();
  const bodyId = useId();
  const { edge, topic: other, evidence, noteLinks = [] } = connection;
  // Only a [[link]] connects them: there's no chat evidence to rate, so no strength dots.
  const noteOnly = edge.kind === "note";
  const filled = Math.max(1, Math.round(edge.strength * STRENGTH_STEPS));
  const showOnMap = (e: MouseEvent) => openView({ kind: "graph", focusTopicId: topic.id, edgeId: edge.id }, e);
  return (
    <li className={s.mention}>
      <div className={s.mentionHead}>
        <button
          type="button"
          className={`${s.iconButton} ${s.mentionFold}`}
          aria-expanded={open}
          aria-controls={bodyId}
          aria-label={`${open ? "Hide" : "Show"} ${noteOnly ? "links" : "excerpts"} with ${other.title}`}
          onClick={() => setOpen((o) => !o)}
        >
          <ChevronDown size={15} aria-hidden className={s.chevron} />
        </button>
        <button type="button" className={s.mentionTopic} onClick={(e) => openTopic(other.id, e)} onAuxClick={(e) => openTopic(other.id, e)}>
          <StateGlyph state={other.state} size={10} /> {other.title}
        </button>
        <span className={s.mentionWhy}>
          {EDGE_KIND_LABEL[edge.kind]}
          {edge.linkedInNote && !noteOnly && " · also linked in a note"}
        </span>
        {noteOnly ? (
          <span className={s.noteLinkTag}>note link</span>
        ) : (
          <span className={s.dots} role="img" aria-label={`Strength ${filled} of ${STRENGTH_STEPS}`}>
            {Array.from({ length: STRENGTH_STEPS }, (_, i) => (
              <span key={i} className={i < filled ? s.dotOn : s.dotOff} />
            ))}
          </span>
        )}
      </div>
      <div id={bodyId} className={s.mentionBody} hidden={!open}>
        <NoteLinkList links={noteLinks} />
        {evidence[0] && <ExcerptBlock excerpt={evidence[0]} onOpenSource={openSource} clampLines={3} />}
        {!evidence[0] && noteLinks.length === 0 && <p className={s.muted}>No excerpt saved for this link.</p>}
        <button type="button" className={s.inlineLink} onClick={showOnMap}>
          {noteOnly ? "Show the link on the map →" : `All ${edge.evidenceCount} excerpts on the map →`}
        </button>
      </div>
    </li>
  );
}

/** Topics this one is connected to, strongest first, like a note's backlinks at its foot. */
export function LinkedMentions({ topic, connections }: { readonly topic: TopicSummary; readonly connections: readonly Connection[] }) {
  const [open, setOpen] = useState(true);
  const headingId = useId();
  const listId = useId();
  const sorted = [...connections].sort((a, b) => b.edge.strength - a.edge.strength);
  return (
    <section className={s.mentions} aria-labelledby={headingId} data-outline="connections">
      <div className={s.mentionsHead}>
        <button
          type="button"
          className={s.iconButton}
          aria-expanded={open}
          aria-controls={listId}
          aria-label={open ? "Fold linked mentions" : "Unfold linked mentions"}
          onClick={() => setOpen((o) => !o)}
        >
          <ChevronDown size={15} aria-hidden className={s.chevron} />
        </button>
        <h2 id={headingId} className={s.mentionsTitle}>
          Linked mentions
        </h2>
        <span className={s.count}>
          {sorted.length}
          <span className="visually-hidden"> {sorted.length === 1 ? "topic" : "topics"}</span>
        </span>
      </div>
      <div id={listId} hidden={!open}>
        {sorted.length === 0 && <p className={s.muted}>No connections yet. They appear when this topic comes up alongside another.</p>}
        <ul className={s.mentionList}>
          {sorted.map((c) => (
            <Mention key={c.edge.id} topic={topic} connection={c} />
          ))}
        </ul>
      </div>
    </section>
  );
}
