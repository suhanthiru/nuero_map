import type { NoteLinkRef } from "../../api/contract";
import { useOpen } from "../workspace/useOpen";
import { useTopicIndex } from "../workspace/viewMeta";
import { plainText } from "./model/note";
import s from "./NoteLinkList.module.css";

/** Quote, list, task and heading markers at the start of a line. */
const LINE_MARKERS = /^\s*(?:>\s*)*(?:[-*+]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+|#{1,6}\s+)?/;

/** A note line as a reader would see it: no leading markers, links shown as their text. */
function readableLine(text: string): string {
  return plainText(text.replace(LINE_MARKERS, "")) || text.trim();
}

/** The note lines that link two topics: whose note, which line, and the line itself. */
export function NoteLinkList({ links }: { readonly links: readonly NoteLinkRef[] }) {
  const topics = useTopicIndex();
  const { openTopic } = useOpen();
  if (links.length === 0) return null;
  return (
    <ul className={s.list} aria-label="Links in your notes">
      {links.map((l) => {
        const title = topics.get(l.topicId)?.title ?? "another topic";
        return (
          <li key={`${l.topicId}-${l.line}`} className={s.item}>
            <p className={s.where}>
              In your note on{" "}
              <button type="button" className={s.topic} onClick={(e) => openTopic(l.topicId, e)} onAuxClick={(e) => openTopic(l.topicId, e)}>
                {title}
              </button>
              , line {l.line}
            </p>
            <p className={s.line}>{readableLine(l.text)}</p>
          </li>
        );
      })}
    </ul>
  );
}
