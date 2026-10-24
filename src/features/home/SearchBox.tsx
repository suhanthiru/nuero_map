import { useState, type KeyboardEvent, type MouseEvent } from "react";
import { useDebounce } from "../../shared/hooks/useDebounce";
import { useOpen } from "../workspace/useOpen";
import { useSearch } from "./queries";
import s from "./Home.module.css";

const DEBOUNCE_MS = 180;

/** Search every topic and idea; Enter opens the top hit. */
export function SearchBox() {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const debounced = useDebounce(query, DEBOUNCE_MS);
  const results = useSearch(debounced);
  const { openTopic } = useOpen();
  const hits = query.trim().length >= 2 ? (results.data ?? []) : [];
  const open = (topicId: string | null, e?: KeyboardEvent | MouseEvent) => {
    if (topicId) openTopic(topicId, e);
  };

  return (
    <div className={s.search} role="search">
      <label htmlFor="home-search" className="visually-hidden">
        Search your topics and ideas
      </label>
      <input
        id="home-search"
        className={s.searchInput}
        type="search"
        placeholder="Search everything you've thought about…"
        value={query}
        autoComplete="off"
        aria-controls="home-search-results"
        aria-activedescendant={hits[active] ? `hit-${hits[active].id}` : undefined}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") setActive((i) => Math.min(hits.length - 1, i + 1));
          else if (e.key === "ArrowUp") setActive((i) => Math.max(0, i - 1));
          else if (e.key === "Enter") open(hits[active]?.topicId ?? null, e);
          else return;
          e.preventDefault();
        }}
      />
      {hits.length > 0 && (
        <ul id="home-search-results" role="listbox" className={s.hits} aria-label="Search results">
          {hits.map((h, i) => (
            <li key={h.id} id={`hit-${h.id}`} role="option" aria-selected={i === active}>
              <button type="button" className={s.hit} onClick={(e) => open(h.topicId, e)} onAuxClick={(e) => open(h.topicId, e)} tabIndex={-1}>
                <span className={s.hitKind}>{h.kind}</span>
                <span className={s.hitTitle}>{h.title}</span>
                <span className={s.hitSnippet}>{h.snippet}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {query.trim().length >= 2 && results.isSuccess && hits.length === 0 && (
        <p className={s.muted} role="status">
          Nothing matches "{query.trim()}".
        </p>
      )}
    </div>
  );
}
