import type { TopicState } from "../../api/contract";

export const STATE_LABEL: Readonly<Record<TopicState, string>> = {
  active: "Active",
  parked: "Parked",
  done: "Done",
  dead: "Dead",
};

interface Props {
  readonly state: TopicState;
  readonly size?: number;
  /** Decorative by default; pass a title to make the glyph speak for itself. */
  readonly title?: string;
  /** Draw in the neutral graph-node color (shape only), as the map does without state colors. */
  readonly mono?: boolean;
}

/**
 * The same shape the graph draws for each state, so state never relies on color alone:
 * active = solid circle, parked = hollow ring, done = solid rounded square, dead = dotted ring.
 */
export function StateGlyph({ state, size = 12, title, mono = false }: Props) {
  const c = size / 2;
  const r = c - 1.5;
  const color = mono ? "var(--graph-node)" : `var(--state-${state})`;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      style={{ flex: "none", verticalAlign: "-0.1em" }}
    >
      {state === "active" && <circle cx={c} cy={c} r={r} fill={color} />}
      {state === "parked" && <circle cx={c} cy={c} r={r - 0.5} fill="none" stroke={color} strokeWidth={2} />}
      {state === "done" && (
        <rect x={c - r * 0.86} y={c - r * 0.86} width={r * 1.72} height={r * 1.72} rx={r * 0.3} fill={color} />
      )}
      {state === "dead" && (
        <circle cx={c} cy={c} r={r - 0.5} fill="none" stroke={color} strokeWidth={1.5} strokeDasharray="1.5 2" />
      )}
    </svg>
  );
}
