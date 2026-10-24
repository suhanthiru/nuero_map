import { userMessageOf } from "../../api/errors";
import { EmptyState } from "../../shared/ui/Page";
import { useSettings } from "../settings/queries";
import { useOpen } from "../workspace/useOpen";
import { CurrentState } from "./CurrentState";
import { InlineTitle } from "./InlineTitle";
import { LinkedMentions } from "./LinkedMentions";
import { UnlinkedMentions } from "./UnlinkedMentions";
import { NoteSection } from "./NoteSection";
import { PinnedGems } from "./PinnedGems";
import { Properties } from "./Properties";
import { Timeline } from "./Timeline";
import { useRecordOpened, useTopicPage } from "./queries";
import s from "./TopicPage.module.css";

const DEFAULT_HALF_LIFE = 14;

/**
 * A topic reads like a note: inline title, properties, the cited current state, your own
 * notes, pinned quotes, the timeline, and the topics that link here at the foot.
 */
export function TopicPage({ topicId }: { readonly topicId: string }) {
  const page = useTopicPage(topicId);
  const settings = useSettings();
  const { open } = useOpen();
  useRecordOpened(topicId);

  if (page.isPending) return <p className={s.loading}>Opening topic…</p>;
  if (page.error || !page.data) {
    return (
      <div className={s.page}>
        <EmptyState title="Couldn't open this topic">
          {userMessageOf(page.error)}{" "}
          <button type="button" className={s.inlineLink} onClick={(e) => open({ kind: "graph" }, e)}>
            Open the map
          </button>
        </EmptyState>
      </div>
    );
  }
  const { topic, current, history, gems, ideas, connections } = page.data;
  return (
    <article className={s.page} aria-label={topic.title}>
      <InlineTitle topic={topic} />
      <Properties topic={topic} ideas={ideas} halfLifeDays={settings.data?.halfLifeDays ?? DEFAULT_HALF_LIFE} />
      <CurrentState topicId={topic.id} current={current} history={history} />
      <NoteSection topicId={topic.id} />
      <PinnedGems topicId={topic.id} gems={gems} />
      <Timeline topicId={topic.id} ideas={ideas} gems={gems} />
      <LinkedMentions topic={topic} connections={connections} />
      <UnlinkedMentions topic={topic} />
    </article>
  );
}
