import { useId } from "react";
import type { GuideSection, SourceIdea, StudyGuide as Guide } from "../../api/contract";
import { ExcerptBlock } from "../../shared/excerpt/ExcerptBlock";
import { useSourceDrawer } from "../source/sourceDrawerStore";
import { useOpen } from "../workspace/useOpen";
import { PRIORITY_META } from "./model/review";
import s from "./Review.module.css";

const SOURCE_CLAMP_LINES = 4;

export function SourceList({ sources, label }: { readonly sources: readonly SourceIdea[]; readonly label: string }) {
  const openSource = useSourceDrawer((st) => st.open);
  if (sources.length === 0) return null;
  return (
    <details className={s.sources}>
      <summary>
        {label} ({sources.length})
      </summary>
      <div className={s.sourceList}>
        {sources.map((src) => (
          <ExcerptBlock key={src.ideaId} excerpt={src.excerpt} onOpenSource={openSource} clampLines={SOURCE_CLAMP_LINES} />
        ))}
      </div>
    </details>
  );
}

interface SectionProps {
  readonly section: GuideSection;
  readonly onShowQuestion: (seq: number) => void;
}

function GuideCard({ section, onShowQuestion }: SectionProps) {
  const headingId = useId();
  const { openTopic } = useOpen();
  const priority = PRIORITY_META[section.priority];
  const topic = section.topic;
  return (
    <section className={s.guideCard} data-priority={section.priority} aria-labelledby={headingId}>
      <header className={s.guideHead}>
        <span className={s.priority} data-priority={section.priority}>
          <span aria-hidden>{priority.glyph}</span> {priority.label}
        </span>
        <h3 id={headingId} className={s.guideTitle}>
          {topic ? (
            <button type="button" className={s.topicLink} onClick={(e) => openTopic(topic.id, e)} onAuxClick={(e) => openTopic(topic.id, e)}>
              {section.title}
            </button>
          ) : (
            section.title
          )}
        </h3>
      </header>
      <p className={s.why}>{section.why}</p>
      {section.misconception && (
        <p className={s.misconception}>
          <strong>Watch out:</strong> {section.misconception}
        </p>
      )}
      {section.keyIdeas.length > 0 && (
        <>
          <h4 className={s.subhead}>Key ideas</h4>
          <ul className={s.keyIdeas}>
            {section.keyIdeas.map((idea, i) => (
              <li key={i}>{idea}</li>
            ))}
          </ul>
        </>
      )}
      {section.practice.length > 0 && (
        <>
          <h4 className={s.subhead}>Test yourself in a few days</h4>
          <ol className={s.practice}>
            {section.practice.map((prompt, i) => (
              <li key={i}>{prompt}</li>
            ))}
          </ol>
        </>
      )}
      <SourceList sources={section.sources} label="Re-read the original" />
      {section.questionSeqs.length > 0 && (
        <p className={s.related}>
          From{" "}
          {section.questionSeqs.map((seq, i) => (
            <span key={seq}>
              {i > 0 && ", "}
              <button type="button" className={s.inlineLink} onClick={() => onShowQuestion(seq)}>
                question {seq}
              </button>
            </span>
          ))}
        </p>
      )}
    </section>
  );
}

interface Props {
  readonly guide: Guide;
  readonly onShowQuestion: (seq: number) => void;
}

/** What to study, most urgent first, built from the answers. */
export function StudyGuide({ guide, onShowQuestion }: Props) {
  return (
    <div className={s.guide}>
      <section className={s.overview} aria-labelledby="guide-overview">
        <h2 id="guide-overview" className={s.blockTitle}>
          How the week went
        </h2>
        <p className={s.overviewText}>{guide.overview}</p>
        {guide.strengths.length > 0 && (
          <ul className={s.strengths} aria-label="What stuck">
            {guide.strengths.map((strength) => (
              <li key={strength}>
                <span aria-hidden>✓</span> {strength}
              </li>
            ))}
          </ul>
        )}
      </section>

      {guide.sections.length > 0 && (
        <section aria-labelledby="guide-study">
          <h2 id="guide-study" className={s.blockTitle}>
            What to study
          </h2>
          <div className={s.guideCards}>
            {guide.sections.map((section, i) => (
              <GuideCard key={`${section.title}-${i}`} section={section} onShowQuestion={onShowQuestion} />
            ))}
          </div>
        </section>
      )}

      {guide.nextSteps.length > 0 && (
        <section aria-labelledby="guide-next">
          <h2 id="guide-next" className={s.blockTitle}>
            This week
          </h2>
          <ol className={s.nextSteps}>
            {guide.nextSteps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
