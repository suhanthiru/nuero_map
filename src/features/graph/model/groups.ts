import type { GraphNode, TopicState } from "../../../api/contract";
import type { ColorGroup, GraphDisplay } from "../state/graphSettingsStore";

export type NodePaint =
  | { readonly kind: "group"; readonly slot: number }
  | { readonly kind: "state"; readonly state: TopicState }
  | { readonly kind: "neutral" };

/**
 * Group and filter query syntax: plain words match the title or aliases (all words must
 * match); `state:parked` matches a state; terms combine with AND.
 */
export function matchesQuery(node: GraphNode, query: string): boolean {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return false;
  const haystack = [node.title, ...node.aliases].join(" ").toLowerCase();
  return terms.every((term) => {
    if (term.startsWith("state:")) return node.state === term.slice("state:".length);
    return haystack.includes(term);
  });
}

export function paintFor(node: GraphNode, groups: readonly ColorGroup[], display: Pick<GraphDisplay, "colorByState">): NodePaint {
  const group = groups.find((g) => matchesQuery(node, g.query));
  if (group) return { kind: "group", slot: group.slot };
  if (display.colorByState) return { kind: "state", state: node.state };
  return { kind: "neutral" };
}
