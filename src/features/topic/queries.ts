import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { call } from "../../api/api";
import { userMessageOf } from "../../api/errors";
import { notify } from "../workspace/notices";
import type { TopicNote, TopicPage, TopicState, TopicSummary } from "../../api/contract";
import { wikilinkRefs, wikilinkTargets, type WikilinkRef } from "./model/note";

export const topicKeys = {
  page: (id: string) => ["topicPage", id] as const,
  note: (id: string) => ["topicNote", id] as const,
  unlinked: (id: string) => ["unlinkedMentions", id] as const,
};

/** Other topics' notes and ideas that name this topic without linking it. */
export function useUnlinkedMentions(topicId: string) {
  return useQuery({ queryKey: topicKeys.unlinked(topicId), queryFn: () => call("get_unlinked_mentions", { topicId }) });
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

export function useTopicPage(id: string) {
  return useQuery({ queryKey: topicKeys.page(id), queryFn: () => call("get_topic_page", { id }) });
}

/** Opening a topic counts as a small mention, keeping it from fading. */
export function useRecordOpened(id: string): void {
  useEffect(() => {
    call("record_topic_opened", { id }).catch(() => undefined);
  }, [id]);
}

/** Optimistic: the control moves immediately and rolls back if the save fails. */
export function useSetTopicState(id: string) {
  const client = useQueryClient();
  const key = topicKeys.page(id);
  return useMutation({
    mutationFn: (state: TopicState) => call("set_topic_state", { id, state, checkInAt: null }),
    onMutate: async (state) => {
      await client.cancelQueries({ queryKey: key });
      const previous = client.getQueryData<TopicPage>(key);
      if (previous) client.setQueryData<TopicPage>(key, { ...previous, topic: { ...previous.topic, state } });
      return { previous };
    },
    onError: (_err, _state, ctx) => {
      if (ctx?.previous) client.setQueryData(key, ctx.previous);
    },
    onSettled: () => {
      client.invalidateQueries({ queryKey: key });
      client.invalidateQueries({ queryKey: ["graph"] });
    },
  });
}

export function usePinGem(topicId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (ideaId: string) => call("pin_gem", { topicId, ideaId }),
    onSuccess: (gem) => {
      const key = topicKeys.page(topicId);
      const page = client.getQueryData<TopicPage>(key);
      if (page && !page.gems.some((g) => g.ideaId === gem.ideaId)) {
        client.setQueryData<TopicPage>(key, { ...page, gems: [gem, ...page.gems] });
      }
    },
  });
}

export function useUnpinGem(topicId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (gemId: string) => call("unpin_gem", { gemId }).then(() => gemId),
    onSuccess: (gemId) => {
      const key = topicKeys.page(topicId);
      const page = client.getQueryData<TopicPage>(key);
      if (page) client.setQueryData<TopicPage>(key, { ...page, gems: page.gems.filter((g) => g.id !== gemId) });
    },
  });
}

export function useRegenerateSynthesis(topicId: string) {
  return useMutation({ mutationFn: () => call("regenerate_synthesis", { topicId, force: true }) });
}

/**
 * The note body the backend last confirmed, per topic. Link changes are judged against
 * this, not the optimistic cache, so a retry after a failed save still refreshes the map.
 */
const confirmedBodies = new Map<string, string>();

export function useTopicNote(topicId: string) {
  return useQuery({
    queryKey: topicKeys.note(topicId),
    queryFn: async () => {
      const note = await call("get_topic_note", { topicId });
      confirmedBodies.set(topicId, note.body);
      return note;
    },
  });
}

const refKey = (r: WikilinkRef) => `${r.line}\u0000${r.target}\u0000${r.text}`;

/** After a save lands: refresh what follows the note's [[links]], as little as it needs. */
function afterNoteSaved(client: QueryClient, topicId: string, saved: string): void {
  const before = confirmedBodies.get(topicId) ?? "";
  confirmedBodies.set(topicId, saved);
  if (!sameList(wikilinkTargets(before), wikilinkTargets(saved))) {
    // Linked topics changed: the map, every page's backlinks and the mention lists follow.
    client.invalidateQueries({ queryKey: ["graph"] });
    client.invalidateQueries({ queryKey: ["topicPage"] });
    client.invalidateQueries({ queryKey: ["unlinkedMentions"] });
    return;
  }
  if (!sameList(wikilinkRefs(before).map(refKey), wikilinkRefs(saved).map(refKey))) {
    // Same topics, but a link moved or its line changed: the pages quote those lines.
    client.invalidateQueries({ queryKey: ["topicPage"] });
  }
  // Plain text can still name other topics: refresh their unlinked mentions next time they're shown.
  client.invalidateQueries({ queryKey: ["unlinkedMentions"], refetchType: "none" });
}

/**
 * Saves the whole body. Saves for one topic run one at a time, in order, so a slow
 * earlier save can never land after a later one. Optimistic: the reading view and word
 * count show the new text at once. A failed save keeps the text on screen (the page
 * offers a retry) instead of reverting to what's stored.
 */
export function useSaveTopicNote(topicId: string) {
  const client = useQueryClient();
  const key = topicKeys.note(topicId);
  return useMutation({
    scope: { id: `note-${topicId}` },
    mutationFn: (body: string) => call("save_topic_note", { topicId, body }),
    onMutate: async (body) => {
      await client.cancelQueries({ queryKey: key });
      client.setQueryData<TopicNote>(key, (prev) => ({ topicId, updatedAt: prev?.updatedAt ?? null, body }));
    },
    // A newer edit may already be in the cache; keep its text and take only the timestamp.
    onSuccess: (note) => {
      client.setQueryData<TopicNote>(key, (prev) => (prev && prev.body !== note.body ? { ...prev, updatedAt: note.updatedAt } : note));
      afterNoteSaved(client, topicId, note.body);
    },
    // The text stays on screen (and the note shows Retry); say so even if you've moved on.
    onError: (err) => notify(`Couldn't save a note: ${userMessageOf(err)} Your text is kept; open the topic to retry.`),
  });
}

/** The note no longer reads the way the edit expected (it changed since it was looked at). */
export class NoteChangedError extends Error {
  constructor() {
    super("note changed");
  }
}

/**
 * Edits a note from somewhere other than its editor (e.g. a Link button). Queued behind
 * that note's pending saves and applied to its newest text, so it can't undo a save or
 * be undone by one. `edit` returns null when the note no longer fits it.
 */
export function useEditTopicNote(topicId: string) {
  const client = useQueryClient();
  const key = topicKeys.note(topicId);
  return useMutation({
    scope: { id: `note-${topicId}` },
    mutationFn: async (edit: (body: string) => string | null) => {
      const current = client.getQueryData<TopicNote>(key) ?? (await call("get_topic_note", { topicId }));
      const next = edit(current.body);
      if (next === null) throw new NoteChangedError();
      client.setQueryData<TopicNote>(key, { ...current, body: next });
      try {
        return await call("save_topic_note", { topicId, body: next });
      } catch (err) {
        client.setQueryData<TopicNote>(key, current);
        throw err;
      }
    },
    onSuccess: (note) => {
      client.setQueryData<TopicNote>(key, note);
      afterNoteSaved(client, topicId, note.body);
    },
  });
}

/** Renaming from the inline title: every list that shows the title refetches. */
export function useRenameTopic(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (title: string) => call("rename_topic", { id, title }),
    onSuccess: (topic) => {
      const key = topicKeys.page(id);
      const page = client.getQueryData<TopicPage>(key);
      if (page) client.setQueryData<TopicPage>(key, { ...page, topic });
      client.setQueryData<TopicSummary[]>(["topics", "all"], (all) => all?.map((t) => (t.id === id ? topic : t)));
      client.invalidateQueries({ queryKey: ["topics"] });
      client.invalidateQueries({ queryKey: ["graph"] });
      // Links resolve by name, so a rename can connect or disconnect notes' [[links]].
      client.invalidateQueries({ queryKey: ["topicPage"] });
      client.invalidateQueries({ queryKey: ["unlinkedMentions"] });
    },
  });
}
