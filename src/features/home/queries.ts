import { useQuery } from "@tanstack/react-query";
import { call } from "../../api/api";

const SEARCH_LIMIT = 8;
const ALIVE_LIMIT = 8;

export function useTodayShelf() {
  return useQuery({ queryKey: ["shelf"], queryFn: () => call("get_today_shelf", {}) });
}

export function useAliveTopics() {
  return useQuery({
    queryKey: ["topics", "alive"],
    queryFn: () => call("list_topics", { filter: { states: ["active", "parked"], sort: "decay", limit: ALIVE_LIMIT } }),
  });
}

export function useSearch(query: string) {
  const q = query.trim();
  return useQuery({
    queryKey: ["search", q],
    queryFn: () => call("search", { query: q, limit: SEARCH_LIMIT }),
    enabled: q.length >= 2,
    staleTime: 10_000,
  });
}
