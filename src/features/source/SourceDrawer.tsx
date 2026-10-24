import { useEffect } from "react";
import type { SourceContext } from "../../api/contract";
import { userMessageOf } from "../../api/errors";
import { CopyButton } from "../../shared/excerpt/CopyButton";
import { APP_LABEL, speakerLabel } from "../../shared/excerpt/apps";
import { formatDateTime } from "../../shared/format/dates";
import { openExternal } from "../../shared/links/openExternal";
import { Button } from "../../shared/ui/Button";
import { focusMessage, transcriptText } from "./model/contextWindow";
import { useSourceContext } from "./queries";
import { useSourceDrawer } from "./sourceDrawerStore";
import s from "./SourceDrawer.module.css";

function Transcript({ ctx }: { readonly ctx: SourceContext }) {
  return (
    <ol className={s.messages}>
      {ctx.messages.map((m) => (
        <li
          key={m.id}
          className={m.id === ctx.focusMessageId ? `${s.message} ${s.focus}` : s.message}
          data-speaker={m.speaker}
          aria-current={m.id === ctx.focusMessageId ? "true" : undefined}
        >
          <div className={s.messageMeta}>
            <span className={s.speaker}>{speakerLabel(m.speaker, ctx.app)}</span>
            <time dateTime={m.timestamp}>{formatDateTime(m.timestamp)}</time>
          </div>
          <p className={s.messageText}>{m.text}</p>
        </li>
      ))}
    </ol>
  );
}

function DrawerBody({ ctx }: { readonly ctx: SourceContext }) {
  const focus = focusMessage(ctx);
  return (
    <>
      <header className={s.header}>
        <p className={s.eyebrow}>{APP_LABEL[ctx.app]}</p>
        <h2 className={s.title}>{ctx.conversationTitle}</h2>
        <div className={s.actions}>
          {focus && <CopyButton text={focus.text} label="Copy message" />}
          <CopyButton text={transcriptText(ctx)} label="Copy excerpt" />
          {ctx.conversationUrl && (
            <Button size="sm" variant="ghost" onClick={() => openExternal(ctx.conversationUrl ?? "")}>
              Open in {APP_LABEL[ctx.app]}
            </Button>
          )}
        </div>
      </header>
      <Transcript ctx={ctx} />
    </>
  );
}

/** Global drawer showing an original message in context. Mounted once in AppShell. */
export function SourceDrawer() {
  const messageId = useSourceDrawer((st) => st.messageId);
  const close = useSourceDrawer((st) => st.close);
  const query = useSourceContext(messageId);

  useEffect(() => {
    if (!messageId) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [messageId, close]);

  if (!messageId) return null;
  return (
    <aside className={s.drawer} role="dialog" aria-label="Source message">
      <button type="button" className={s.close} onClick={close} aria-label="Close source">
        ×
      </button>
      {query.isPending && <p className={s.status}>Loading source…</p>}
      {query.isError && <p className={s.status}>{userMessageOf(query.error)}</p>}
      {query.data && <DrawerBody ctx={query.data} />}
    </aside>
  );
}
