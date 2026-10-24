import { useId, useState, type ReactNode } from "react";
import { Activity, CalendarCheck, CalendarPlus, ChevronDown, CircleDot, Clock, Lightbulb, Tags, TrendingUp, type LucideIcon } from "lucide-react";
import { TOPIC_STATES, type Idea, type TopicState, type TopicSummary } from "../../api/contract";
import { userMessageOf } from "../../api/errors";
import { formatDate, relativeDays } from "../../shared/format/dates";
import { decayBucket } from "../../shared/model/decay";
import { STATE_LABEL, StateGlyph } from "../../shared/ui/StateGlyph";
import { weeklyActivity } from "./model/timeline";
import { useSetTopicState } from "./queries";
import s from "./TopicPage.module.css";

const ACTIVITY_WEEKS = 16;
const BAR_W = 6;
const BAR_GAP = 2;
const STRIP_H = 18;

const STATE_HELP: Readonly<Record<TopicState, string>> = {
  active: "You're working on this.",
  parked: "On hold; it'll come back on the Today shelf.",
  done: "Settled. Stays searchable, stops nagging.",
  dead: "Dropped. Hidden from the map by default.",
};

function ActivityStrip({ ideas }: { readonly ideas: readonly Idea[] }) {
  const weeks = weeklyActivity(ideas, ACTIVITY_WEEKS);
  const max = Math.max(1, ...weeks.map((w) => w.count));
  const total = weeks.reduce((n, w) => n + w.count, 0);
  const busiest = weeks.reduce((b, w) => (w.count > b.count ? w : b), weeks[0]);
  const summary = total
    ? `${total} ideas in the last ${ACTIVITY_WEEKS} weeks; busiest was the week of ${formatDate(busiest.start)} with ${busiest.count}.`
    : `No ideas in the last ${ACTIVITY_WEEKS} weeks.`;
  return (
    <figure className={s.activity}>
      <svg width={ACTIVITY_WEEKS * (BAR_W + BAR_GAP)} height={STRIP_H} role="img" aria-label={summary}>
        {weeks.map((w, i) => {
          const h = w.count === 0 ? 2 : Math.max(3, (w.count / max) * STRIP_H);
          return (
            <rect key={w.start} x={i * (BAR_W + BAR_GAP)} y={STRIP_H - h} width={BAR_W} height={h} rx={1} className={w.count === 0 ? s.barEmpty : s.bar}>
              <title>{`Week of ${formatDate(w.start)}: ${w.count} ${w.count === 1 ? "idea" : "ideas"}`}</title>
            </rect>
          );
        })}
      </svg>
      <figcaption className={s.propNote}>{total} in {ACTIVITY_WEEKS} weeks</figcaption>
    </figure>
  );
}

function Prop({ icon: Icon, name, children }: { readonly icon: LucideIcon; readonly name: string; readonly children: ReactNode }) {
  return (
    <div className={s.prop}>
      <dt className={s.propKey}>
        <Icon size={15} strokeWidth={1.75} aria-hidden /> {name}
      </dt>
      <dd className={s.propValue}>{children}</dd>
    </div>
  );
}

interface Props {
  readonly topic: TopicSummary;
  readonly ideas: readonly Idea[];
  readonly halfLifeDays: number;
}

/** Facts about the topic as a notes app shows a note's properties: one labelled row each. */
export function Properties({ topic, ideas, halfLifeDays }: Props) {
  const [open, setOpen] = useState(true);
  const setState = useSetTopicState(topic.id);
  const listId = useId();
  const alive = Math.round(topic.decay * 100);
  return (
    <section className={s.properties} aria-label="Properties" data-outline="properties">
      <button type="button" className={s.propertiesHead} aria-expanded={open} aria-controls={listId} onClick={() => setOpen((o) => !o)}>
        <ChevronDown size={14} aria-hidden className={s.chevron} /> Properties
      </button>
      <dl id={listId} className={s.propList} hidden={!open}>
        <Prop icon={CircleDot} name="state">
          <span role="radiogroup" aria-label="Topic state" className={s.stateControl}>
            {TOPIC_STATES.map((st) => (
              <button key={st} type="button" role="radio" aria-checked={topic.state === st} className={s.stateOption} onClick={() => setState.mutate(st)}>
                <StateGlyph state={st} size={10} /> {STATE_LABEL[st]}
              </button>
            ))}
          </span>
          <span className={s.propNote}>{STATE_HELP[topic.state]}</span>
          {setState.error && <span className={s.error}>{userMessageOf(setState.error)}</span>}
        </Prop>
        {topic.aliases.length > 0 && (
          <Prop icon={Tags} name="aliases">
            {topic.aliases.map((a) => (
              <span key={a} className={s.pill}>
                {a}
              </span>
            ))}
          </Prop>
        )}
        <Prop icon={TrendingUp} name="alive">
          <span className={s.aliveWord}>{decayBucket(topic.decay)}</span>
          <span className={s.aliveMeter} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={alive} aria-label="How alive this topic is">
            <span style={{ width: `${alive}%` }} />
          </span>
          <span className={s.propNote}>Halves every {halfLifeDays} days without a mention.</span>
        </Prop>
        <Prop icon={Clock} name="last active">
          {relativeDays(topic.lastActiveAt)} <span className={s.propNote}>{formatDate(topic.lastActiveAt)}</span>
        </Prop>
        {topic.checkInAt && (
          <Prop icon={CalendarCheck} name="check-in">
            {formatDate(topic.checkInAt)}
          </Prop>
        )}
        <Prop icon={CalendarPlus} name="first seen">
          {formatDate(topic.createdAt)}
        </Prop>
        <Prop icon={Lightbulb} name="ideas">
          {topic.ideaCount}
        </Prop>
        <Prop icon={Activity} name="activity">
          <ActivityStrip ideas={ideas} />
        </Prop>
      </dl>
    </section>
  );
}
