import { useEffect, useState } from "react";
import type { TopicSummary } from "../../api/contract";
import { userMessageOf } from "../../api/errors";
import { useRenameTopic } from "./queries";
import s from "./TopicPage.module.css";

/** The topic's name as the page heading, editable in place: Enter renames, Esc cancels. */
export function InlineTitle({ topic }: { readonly topic: TopicSummary }) {
  const rename = useRenameTopic(topic.id);
  const [draft, setDraft] = useState(topic.title);

  useEffect(() => setDraft(topic.title), [topic.title]);

  const commit = () => {
    const title = draft.replace(/\s+/g, " ").trim();
    if (!title || title === topic.title) {
      setDraft(topic.title);
      return;
    }
    rename.mutate(title, { onError: () => setDraft(topic.title) });
  };

  return (
    <>
      <h1 className={s.inlineTitle}>
        <textarea
          className={s.titleInput}
          rows={1}
          value={draft}
          spellCheck={false}
          aria-label="Topic title (edit to rename)"
          onChange={(e) => setDraft(e.target.value.replace(/\n/g, ""))}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.currentTarget.blur();
            } else if (e.key === "Escape") {
              e.preventDefault();
              const el = e.currentTarget;
              setDraft(topic.title);
              // Blur after the reset renders, so the blur handler sees the original title.
              requestAnimationFrame(() => el.blur());
            }
          }}
        />
      </h1>
      {rename.error && (
        <p className={`${s.titleHint} ${s.error}`} role="alert">
          {userMessageOf(rename.error)}
        </p>
      )}
    </>
  );
}
