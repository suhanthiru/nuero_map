import { useCallback, useMemo } from "react";
import type { TopicSummary, VaultTree } from "../../api/contract";
import { noteIdOfLink, noteLinkId, type LinkTarget } from "../topic/model/linkTarget";
import { useOpen } from "../workspace/useOpen";
import { useAllTopics } from "../workspace/viewMeta";
import { folderPath } from "./model/tree";
import { useVault } from "./queries";

/** Topics first (a topic wins when a note has the same title), then notes, hinted with their folder. */
export function linkTargets(topics: readonly TopicSummary[], vault: VaultTree | undefined): LinkTarget[] {
  const notes = (vault?.notes ?? []).map(
    (n): LinkTarget => ({
      id: noteLinkId(n.id),
      title: n.title,
      aliases: [],
      decay: 0,
      hint: folderPath(n.folderId, vault?.folders ?? []).join(" / ") || "note",
    }),
  );
  return [...topics, ...notes];
}

/** Everything a `[[link]]` in a note can point at. */
export function useLinkTargets(): readonly LinkTarget[] {
  const topics = useAllTopics();
  const vault = useVault();
  return useMemo(() => linkTargets(topics.data ?? [], vault.data), [topics.data, vault.data]);
}

type OpenEvent = Parameters<ReturnType<typeof useOpen>["open"]>[1];

/** Opens a link target by id: a note (`note:<id>`) or a topic. */
export function useOpenLink(): (id: string, e?: OpenEvent) => void {
  const { open } = useOpen();
  return useCallback(
    (id: string, e?: OpenEvent) => {
      const noteId = noteIdOfLink(id);
      open(noteId ? { kind: "note", noteId } : { kind: "topic", topicId: id }, e);
    },
    [open],
  );
}
