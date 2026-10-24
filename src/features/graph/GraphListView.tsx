import { useMemo, useState, type MouseEvent } from "react";
import type { GraphNode } from "../../api/contract";
import { relativeDays } from "../../shared/format/dates";
import { STATE_LABEL, StateGlyph } from "../../shared/ui/StateGlyph";
import { neighbours } from "./model/filterGraph";
import { importance } from "./model/scales";
import type { VisibleGraph } from "./model/types";
import s from "./Graph.module.css";

type SortKey = "importance" | "title" | "ideas" | "recent" | "links";

const COLUMNS: readonly { key: SortKey; label: string }[] = [
  { key: "title", label: "Topic" },
  { key: "importance", label: "Alive" },
  { key: "ideas", label: "Ideas" },
  { key: "links", label: "Links" },
  { key: "recent", label: "Last active" },
];

/**
 * The map as a table: the same topics and connections, readable by screen readers,
 * sortable, and handy when you know roughly what you're looking for.
 */
export function GraphListView({ graph, onOpen, onSelect }: { readonly graph: VisibleGraph; readonly onOpen: (id: string, e?: MouseEvent) => void; readonly onSelect: (id: string) => void }) {
  const [sort, setSort] = useState<SortKey>("importance");
  const adj = useMemo(() => neighbours(graph), [graph]);
  const byId = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph.nodes]);
  const rows = useMemo(() => {
    const value = (n: GraphNode): number | string => {
      switch (sort) {
        case "title":
          return n.title.toLowerCase();
        case "ideas":
          return -n.ideaCount;
        case "links":
          return -(adj.get(n.id)?.size ?? 0);
        case "recent":
          return -Date.parse(n.lastActiveAt);
        default:
          return -importance(n);
      }
    };
    return [...graph.nodes].sort((a, b) => {
      const va = value(a);
      const vb = value(b);
      return va < vb ? -1 : va > vb ? 1 : 0;
    });
  }, [graph.nodes, sort, adj]);

  return (
    <div className={s.listWrap}>
      <table className={s.table}>
        <caption className="visually-hidden">Topics, sorted by {COLUMNS.find((c) => c.key === sort)?.label}</caption>
        <thead>
          <tr>
            <th scope="col">State</th>
            {COLUMNS.map((c) => (
              <th key={c.key} scope="col" aria-sort={sort === c.key ? (c.key === "title" ? "ascending" : "descending") : "none"}>
                <button type="button" className={s.sortButton} onClick={() => setSort(c.key)}>
                  {c.label}
                </button>
              </th>
            ))}
            <th scope="col">Connected to</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((n) => {
            const linked = [...(adj.get(n.id) ?? [])].map((id) => byId.get(id)).filter((x): x is GraphNode => !!x);
            return (
              <tr key={n.id}>
                <td>
                  <StateGlyph state={n.state} size={11} title={STATE_LABEL[n.state]} />
                </td>
                <th scope="row">
                  <button type="button" className={s.rowTopic} onClick={(e) => onOpen(n.id, e)} onAuxClick={(e) => onOpen(n.id, e)}>
                    {n.title}
                  </button>
                </th>
                <td>
                  <span className={s.aliveBar} aria-label={`${Math.round(n.decay * 100)} percent`}>
                    <span style={{ width: `${Math.round(n.decay * 100)}%` }} />
                  </span>
                </td>
                <td className={s.num}>{n.ideaCount}</td>
                <td className={s.num}>{linked.length}</td>
                <td>{relativeDays(n.lastActiveAt)}</td>
                <td className={s.linkedCell}>
                  {linked.slice(0, 3).map((o) => (
                    <button key={o.id} type="button" className={s.linkedChip} onClick={() => onSelect(o.id)}>
                      {o.title}
                    </button>
                  ))}
                  {linked.length > 3 && <span className={s.more}>+{linked.length - 3}</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
