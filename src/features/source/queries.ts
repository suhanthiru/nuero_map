import { useQuery } from "@tanstack/react-query";
import { call } from "../../api/api";
import type { MessageId } from "../../api/contract";

export const DEFAULT_CONTEXT_TURNS = 3;

export const sourceKeys = {
  context: (messageId: MessageId) => ["source", messageId] as const,
};

export function useSourceContext(messageId: MessageId | null) {
  return useQuery({
    queryKey: sourceKeys.context(messageId ?? ""),
    queryFn: () => call("get_source_context", { messageId: messageId ?? "", turns: DEFAULT_CONTEXT_TURNS }),
    enabled: messageId !== null,
    staleTime: Infinity,
  });
}
