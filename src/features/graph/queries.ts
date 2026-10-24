import { useQuery } from "@tanstack/react-query";
import { call } from "../../api/api";

export const graphKeys = {
  all: ["graph"] as const,
  evidence: (edgeId: string) => ["graph", "evidence", edgeId] as const,
};

/** Fetches everything once; filtering happens client-side so toggles are instant. */
export function useGraph() {
  return useQuery({
    queryKey: graphKeys.all,
    queryFn: () => call("get_graph", { opts: { includeDead: true, includeSemantic: true } }),
  });
}

export function useEdgeEvidence(edgeId: string | null) {
  return useQuery({
    queryKey: graphKeys.evidence(edgeId ?? ""),
    queryFn: () => call("get_edge_evidence", { edgeId: edgeId ?? "" }),
    enabled: edgeId !== null,
  });
}
