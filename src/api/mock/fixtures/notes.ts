import type { TopicNote } from "../../contract";
import { daysAgo } from "../rng";

const NEURAL_MAP = `The graph is for **navigation**; the excerpts and the cited summary are the product.

## Open questions

- [x] Size nodes by how alive a topic is, see [[Decay scoring for ideas]]
- [ ] Should a [[wikilink]] in a note count as an explicit edge?
- [ ] Gemini capture via the Chrome extension

## Design notes

Borrow the look of a notes app: one readable column, an inline title, properties up top.
Keep everything usable from the keyboard.

> [!tip] Stocks and flows again
> [[Thinking in Systems notes|systems thinking]] keeps showing up.

\`\`\`
alive = sum(weight * 0.5 ^ (age_days / half_life))
\`\`\`
`;

const DECAY = `Half-life of **14 days** feels right; revisit after a month of real use.

- Opening a topic counts as a small mention
- Parked topics come back on their check-in date
`;

const SYSTEMS_BOOK = `Stocks and flows map neatly onto decay scoring for ideas: mentions are inflows,
time is the outflow.

- Reread the chapter on delays before tuning the half-life
`;

const ROBOT_ARM = `Wrist jitter is power, not signal. Try the bulk capacitor first.

Learning async Rust might pay off for the control loop, but tokio feels like overkill here.
`;

const SEEDED: readonly TopicNote[] = [
  { topicId: "t-neural-map", body: NEURAL_MAP, updatedAt: daysAgo(1) },
  { topicId: "t-decay", body: DECAY, updatedAt: daysAgo(3) },
  { topicId: "t-systems-book", body: SYSTEMS_BOOK, updatedAt: daysAgo(5) },
  { topicId: "t-robot-arm", body: ROBOT_ARM, updatedAt: daysAgo(2) },
];

export const MOCK_NOTES: ReadonlyMap<string, TopicNote> = new Map(SEEDED.map((n) => [n.topicId, n]));
