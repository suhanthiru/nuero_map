import { useId, useRef, useState } from "react";
import { ChevronDown, Link2 } from "lucide-react";
import type { TopicSummary, UnlinkedMention } from "../../api/contract";
import { userMessageOf } from "../../api/errors";
import { APP_LABEL, speakerLabel } from "../../shared/excerpt/apps";
import { formatDate } from "../../shared/format/dates";
import { StateGlyph } from "../../shared/ui/StateGlyph";
import { useSourceDrawer } from "../source/sourceDrawerStore";
import { useOpen } from "../workspace/useOpen";
import { appendLinkLine, groupMentions, linkMentionInNote, snippetAround } from "./model/mentions";
import { wikilinkTargets } from "./model/note";
import { NoteChangedError, useEditTopicNote, useUnlinkedMentions } from "./queries";
import s from "./UnlinkedMentions.module.css";
import page from "./TopicPage.module.css";

type Announce = (message: string) => void;

function Snippet({ mention }: { readonly mention: UnlinkedMention }) {
  const { before, match, after } = snippetAround(mention.text, mention.start, mention.end);
  return (
    <p className={s.snippet}>
      {before}
      <mark className={s.mark}>{match}</mark>
      {after}
    </p>
  );
}

interface RowProps {
  readonly topic: TopicSummary;
  readonly mention: UnlinkedMention;
  readonly announce: Announce;
  /** After linking, keep keyboard focus nearby: this row is about to leave the list. */
  readonly onLinked: (button: HTMLButtonElement) => void;
}

const linkKey = (name: string) => name.replace(/\s+/g, " ").trim().toLowerCase();

/** One mention and its Link button. Note mentions are rewritten in place; idea mentions add a line to this topic's note. */
function MentionRow({ topic, mention, announce, onLinked }: RowProps) {
  const [busy, setBusy] = useState(false);
  const openSource = useSourceDrawer((st) => st.open);
  // A note mention edits the other topic's note; an idea mention edits this one's.
  const editOther = useEditTopicNote(mention.topic.id);
  const editHere = useEditTopicNote(topic.id);
  const written = mention.text.slice(mention.start, mention.end);

  const link = async (button: HTMLButtonElement) => {
    if (busy) return;
    setBusy(true);
    try {
      if (mention.source === "note") {
        await editOther.mutateAsync((body) => linkMentionInNote(body, mention, topic.title));
        announce(`Linked “${written}” in your note on ${mention.topic.title}.`);
      } else {
        let already = false;
        await editHere.mutateAsync((body) => {
          already = wikilinkTargets(body).includes(linkKey(mention.topic.title));
          return already ? body : appendLinkLine(body, mention.topic.title);
        });
        announce(already ? `${mention.topic.title} is already linked from this note.` : `Added [[${mention.topic.title}]] to your note on ${topic.title}.`);
      }
      onLinked(button);
    } catch (err) {
      announce(err instanceof NoteChangedError ? `That note changed; open ${mention.topic.title} to link it by hand.` : `Couldn't link it: ${userMessageOf(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const ex = mention.excerpt;
  const label =
    mention.source === "note"
      ? `Link “${written}” on line ${mention.line} of your note on ${mention.topic.title}`
      : `Link ${mention.topic.title} from this topic's note`;
  return (
    <li className={s.row}>
      <div className={s.rowBody}>
        {ex && (
          <p className={s.meta}>
            {speakerLabel(ex.source.speaker, ex.source.app)} · {APP_LABEL[ex.source.app]} · {formatDate(ex.source.timestamp)}
            <button type="button" className={s.metaLink} onClick={() => openSource(ex.source.messageId)}>
              open source
            </button>
          </p>
        )}
        {mention.line !== null && <p className={s.meta}>Line {mention.line}</p>}
        <Snippet mention={mention} />
      </div>
      <button
        type="button"
        className={s.linkButton}
        data-link-button
        // aria-disabled, not disabled: a disabled button would drop keyboard focus to the page.
        aria-disabled={busy}
        onClick={(e) => void link(e.currentTarget)}
        aria-label={label}
        title={mention.source === "note" ? `Turn it into [[${topic.title}]]` : `Add [[${mention.topic.title}]] to this note`}
      >
        <Link2 size={13} aria-hidden /> {busy ? "Linking…" : "Link"}
      </button>
    </li>
  );
}

/**
 * Notes and ideas that name this topic without linking it, folded like a notes app's
 * "Unlinked mentions". Linking one makes it a real connection on the map.
 */
export function UnlinkedMentions({ topic }: { readonly topic: TopicSummary }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState("");
  const foldButton = useRef<HTMLButtonElement>(null);
  // Clear first so the same message twice in a row is announced again.
  const announce = (message: string) => {
    setStatus("");
    requestAnimationFrame(() => setStatus(message));
  };
  const onLinked = (button: HTMLButtonElement) => {
    const all = [...(button.closest("ul[data-mentions]")?.querySelectorAll<HTMLButtonElement>("button[data-link-button]") ?? [])];
    const next = all[all.indexOf(button) + 1] ?? all[all.indexOf(button) - 1];
    (next ?? foldButton.current)?.focus();
  };
  const mentions = useUnlinkedMentions(topic.id);
  const { openTopic } = useOpen();
  const headingId = useId();
  const listId = useId();
  const list = mentions.data ?? [];
  const groups = groupMentions(list);
  return (
    <section className={s.section} aria-labelledby={headingId} data-outline="unlinked">
      <div className={page.mentionsHead}>
        <button
          ref={foldButton}
          type="button"
          className={page.iconButton}
          aria-expanded={open}
          aria-controls={listId}
          aria-label={open ? "Fold unlinked mentions" : "Unfold unlinked mentions"}
          onClick={() => setOpen((o) => !o)}
        >
          <ChevronDown size={15} aria-hidden className={page.chevron} />
        </button>
        <h2 id={headingId} className={page.mentionsTitle}>
          Unlinked mentions
        </h2>
        {mentions.isSuccess && (
          <span className={page.count}>
            {list.length}
            <span className="visually-hidden"> {list.length === 1 ? "mention" : "mentions"}</span>
          </span>
        )}
      </div>
      <p className={s.status} role="status">
        {status}
      </p>
      <div id={listId} hidden={!open}>
        {mentions.isPending && <p className={page.muted}>Looking for mentions…</p>}
        {mentions.error && <p className={page.error}>{userMessageOf(mentions.error)}</p>}
        {mentions.isSuccess && list.length === 0 && (
          <p className={page.muted}>No other note or idea names “{topic.title}” without linking it.</p>
        )}
        <ul className={s.groups} data-mentions>
          {groups.map((g) => {
            const source = g.mentions[0].topic;
            const kinds = new Set(g.mentions.map((m) => m.source));
            return (
              <li key={g.topicId} className={s.group}>
                <div className={s.groupHead}>
                  <button type="button" className={page.mentionTopic} onClick={(e) => openTopic(source.id, e)} onAuxClick={(e) => openTopic(source.id, e)}>
                    <StateGlyph state={source.state} size={10} /> {source.title}
                  </button>
                  <span className={page.mentionWhy}>
                    {kinds.has("note") && kinds.has("idea") ? "in your note and its chats" : kinds.has("note") ? "in your note" : "in a chat"} · {g.mentions.length}
                  </span>
                </div>
                <ul className={s.rows}>
                  {g.mentions.map((m, i) => (
                    <MentionRow key={`${m.source}-${m.line ?? m.excerpt?.source.messageId}-${m.start}-${i}`} topic={topic} mention={m} announce={announce} onLinked={onLinked} />
                  ))}
                </ul>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
