import type {
  CommandArgs,
  CommandName,
  CommandResult,
  Connection,
  EdgeEvidence,
  GraphEdge,
  MergeSuggestion,
  SearchHit,
  Settings,
  TopicNote,
  TopicState,
  TopicSummary,
} from "../contract";
import { NOTE_MAX_CHARS } from "../contract/notes";
import type { Transport } from "../transport";
import { MOCK_EDGES, mockGraph, syntheticGraph } from "./fixtures/graph";
import { unlinkedMentions } from "./fixtures/mentions";
import { noteLinksBetween, resolveNoteLinks, withNoteEdges } from "./fixtures/noteLinks";
import { ideasFor, mockEdgeEvidence, mockTopicPage } from "./fixtures/pages";
import { sourceContext } from "./fixtures/sources";
import { MOCK_NOTES } from "./fixtures/notes";
import { MOCK_TOPICS } from "./fixtures/topics";
import { captureConfig, isValidCapturePort, newCaptureToken, restartListener, simulateCapture, type MockCaptureState } from "./mockCapture";
import { mockEmit, mockListen } from "./mockEvents";
import { cancelMockJob, runMockJob } from "./mockJobs";
import { getReview, listReviewWeeks, saveReviewAnswer, startReview, submitReview } from "./mockReview";
import * as vault from "./mockVault";
import { daysAgo, MOCK_NOW } from "./rng";

const LATENCY_MS = 120;

interface MockState {
  topics: readonly TopicSummary[];
  settings: Settings;
  merges: readonly MergeSuggestion[];
  notes: ReadonlyMap<string, TopicNote>;
  /** Token, listening flag and error; the port and on/off switch live in `settings`. */
  capture: MockCaptureState;
}

const state: MockState = {
  topics: MOCK_TOPICS,
  settings: {
    synthesisModel: "claude-opus-5-5",
    halfLifeDays: 14,
    hasApiKey: false,
    capturePort: 47831,
    captureEnabled: false,
    embeddingModelReady: true,
  },
  capture: { token: "3f9c1a7e5b2d4c8f9a0e1b3d5f7a9c2e4b6d8f0a1c3e5a7b9d2f4a6c8e0b1d3f", listening: false, error: null },
  merges: [
    {
      id: "mg-1",
      from: MOCK_TOPICS[3],
      into: MOCK_TOPICS[0],
      confidence: 0.91,
      reason: "Both describe capturing thoughts into the idea graph.",
      sharedIdeaCount: 3,
      createdAt: daysAgo(2),
    },
  ],
  notes: MOCK_NOTES,
};

function withTopicState(id: string, next: TopicState): TopicSummary {
  const topic = state.topics.find((t) => t.id === id);
  if (!topic) throw { code: "not_found", message: `topic ${id}` };
  const updated = { ...topic, state: next };
  state.topics = state.topics.map((t) => (t.id === id ? updated : t));
  mockEmit("topics_changed", { topicIds: [id] });
  return updated;
}

/** Chat edges plus what the notes link right now, so writing `[[…]]` shows up on the map and pages. */
function linkedState() {
  const links = resolveNoteLinks(state.notes, state.topics);
  return { links, edges: withNoteEdges(MOCK_EDGES, links, state.notes) };
}

function topicSummary(id: string) {
  const topic = state.topics.find((t) => t.id === id);
  if (!topic) throw { code: "not_found", message: `topic ${id}` };
  return topic;
}

function connectionsWithNotes(topicId: string, base: readonly Connection[]): Connection[] {
  const { links, edges } = linkedState();
  const byPair = new Map(base.map((c) => [c.topic.id, c]));
  return edges
    .filter((e) => e.source === topicId || e.target === topicId)
    .flatMap((edge): Connection[] => {
      const otherId = edge.source === topicId ? edge.target : edge.source;
      const noteLinks = noteLinksBetween(links, topicId, otherId);
      const found = byPair.get(otherId);
      if (found) return [{ ...found, edge, noteLinks }];
      const other = state.topics.find((t) => t.id === otherId);
      return other ? [{ edge, topic: other, evidence: [], noteLinks }] : [];
    });
}

function edgeEvidence(edgeId: string): EdgeEvidence {
  const { links, edges } = linkedState();
  const edge: GraphEdge | undefined = edges.find((e) => e.id === edgeId);
  if (!edge) throw { code: "not_found", message: `edge ${edgeId}` };
  const noteLinks = noteLinksBetween(links, edge.source, edge.target);
  if (edge.kind === "note") return { edge, topics: [topicSummary(edge.source), topicSummary(edge.target)], excerpts: [], noteLinks };
  return { ...mockEdgeEvidence(edgeId), edge, noteLinks };
}

type Handlers = { [K in CommandName]: (args: CommandArgs<K>) => CommandResult<K> };

const graphSize = Number(import.meta.env.VITE_MOCK_GRAPH_SIZE ?? 0);

const handlers: Handlers = {
  estimate_import: ({ path }) => ({
    path,
    detectedSource: path.toLowerCase().includes("chatgpt") ? "chatgpt" : "claude",
    conversations: 1480,
    newConversations: 1480,
    changedConversations: 0,
    messages: 21400,
    estimatedInputTokens: 9_200_000,
    estimatedOutputTokens: 1_100_000,
    estimatedCostUsd: 7.35,
    extractionModel: "claude-haiku-4-5",
  }),
  import_export_zip: () => runMockJob("import", 1480),
  list_jobs: () => [],
  cancel_job: ({ jobId }) => cancelMockJob(jobId),
  retry_job: () => false,
  list_topics: ({ filter }) =>
    state.topics.filter((t) => !filter.states || filter.states.includes(t.state)).slice(0, filter.limit),
  get_topic_page: ({ id }) => {
    const page = mockTopicPage(id);
    return { ...page, topic: state.topics.find((t) => t.id === id) ?? page.topic, connections: connectionsWithNotes(id, page.connections) };
  },
  record_topic_opened: () => null,
  set_topic_state: ({ id, state: next }) => withTopicState(id, next),
  rename_topic: ({ id, title }) => {
    const topic = state.topics.find((t) => t.id === id);
    if (!topic) throw { code: "not_found", message: id };
    const updated = { ...topic, title };
    state.topics = state.topics.map((t) => (t.id === id ? updated : t));
    return updated;
  },
  regenerate_synthesis: () => runMockJob("synthesis", 1, ["synthesizing"]),
  get_synthesis: ({ synthesisId }) => {
    const page = mockTopicPage(synthesisId.split("-").slice(1, -1).join("-"));
    const found = page.history.find((v) => v.id === synthesisId);
    if (!found) throw { code: "not_found", message: synthesisId };
    return found;
  },
  get_topic_note: ({ topicId }) => state.notes.get(topicId) ?? { topicId, body: "", updatedAt: null },
  save_topic_note: ({ topicId, body }) => {
    if (!state.topics.some((t) => t.id === topicId)) throw { code: "not_found", message: `topic ${topicId}` };
    if (body.length > NOTE_MAX_CHARS) throw { code: "invalid_input", message: "note is too long" };
    const note: TopicNote = { topicId, body, updatedAt: body ? new Date().toISOString() : null };
    const notes = new Map(state.notes);
    if (body) notes.set(topicId, note);
    else notes.delete(topicId);
    state.notes = notes;
    return note;
  },
  get_vault: () => vault.getVault(),
  create_folder: (args) => vault.createFolder(args),
  rename_folder: (args) => vault.renameFolder(args),
  move_folder: (args) => vault.moveFolder(args),
  delete_folder: (args) => vault.deleteFolder(args),
  create_note: (args) => vault.createNote(args),
  get_note: (args) => vault.getNote(args),
  save_note: (args) => vault.saveNote(args),
  rename_note: (args) => vault.renameNote(args),
  move_note: (args) => vault.moveNote(args),
  delete_note: (args) => vault.deleteNote(args),
  import_documents: (args) => vault.importDocuments(args),
  pin_gem: ({ topicId, ideaId }) => {
    const idea = mockTopicPage(topicId).ideas.find((i) => i.id === ideaId);
    if (!idea) throw { code: "not_found", message: ideaId };
    return { id: `g-${ideaId}`, topicId, ideaId, excerpt: idea.excerpt, pinnedAt: new Date().toISOString() };
  },
  unpin_gem: () => null,
  get_graph: () => {
    if (graphSize > 0) return syntheticGraph(graphSize);
    const base = mockGraph();
    const byId = new Map(state.topics.map((t) => [t.id, t]));
    return { ...base, nodes: base.nodes.map((n) => ({ ...n, ...byId.get(n.id) })), edges: linkedState().edges };
  },
  get_edge_evidence: ({ edgeId }) => edgeEvidence(edgeId),
  get_unlinked_mentions: ({ topicId }) => {
    const { edges } = linkedState();
    const connected = new Set(edges.flatMap((e) => (e.source === topicId ? [e.target] : e.target === topicId ? [e.source] : [])));
    return unlinkedMentions({ topicId, topics: state.topics, notes: state.notes, connected, ideasOf: ideasFor });
  },
  get_today_shelf: () => ({
    generatedAt: new Date(MOCK_NOW).toISOString(),
    cards: [
      { reason: "fading", topic: state.topics[4], detail: "Hot three weeks ago, quiet for 4 days." },
      { reason: "parked", topic: state.topics[6], detail: "Parked 45 days ago. Check-in is due." },
      {
        reason: "newConnection",
        topic: state.topics[1],
        detail: "Newly linked to Thinking in Systems.",
        relatedTopic: state.topics[10],
      },
    ],
  }),
  search: ({ query, limit }) =>
    [
      ...state.topics
        .filter((t) => `${t.title} ${t.summary} ${t.aliases.join(" ")}`.toLowerCase().includes(query.toLowerCase()))
        .map((t, i): SearchHit => ({ kind: "topic", id: t.id, topicId: t.id, noteId: null, title: t.title, snippet: t.summary, score: 1 - i * 0.05 })),
      ...vault.searchNotes(query),
    ].slice(0, limit),
  get_source_context: ({ messageId, turns }) => sourceContext(messageId, turns),
  list_review_weeks: () => listReviewWeeks(),
  start_review: ({ weekOf }) => startReview(weekOf),
  get_review: ({ id }) => getReview(id),
  save_review_answer: ({ reviewId, questionId, response }) => saveReviewAnswer(reviewId, questionId, response),
  submit_review: ({ id, answers }) => submitReview(id, answers),
  list_merge_suggestions: () => [...state.merges],
  accept_merge_suggestion: ({ id }) => {
    const merge = state.merges.find((m) => m.id === id);
    if (!merge) throw { code: "not_found", message: id };
    state.merges = state.merges.filter((m) => m.id !== id);
    return merge.into;
  },
  reject_merge_suggestion: ({ id }) => {
    state.merges = state.merges.filter((m) => m.id !== id);
    return null;
  },
  get_settings: () => state.settings,
  set_settings: ({ patch }) => {
    if (patch.capturePort !== undefined && !isValidCapturePort(patch.capturePort)) {
      throw { code: "invalid_input", message: `capture port ${patch.capturePort} is outside 1024-65535` };
    }
    const prev = state.settings;
    state.settings = { ...prev, ...patch };
    if (state.settings.captureEnabled !== prev.captureEnabled || state.settings.capturePort !== prev.capturePort) {
      state.capture = restartListener(state.settings, state.capture.token);
    }
    return state.settings;
  },
  set_api_key: ({ key }) => {
    if (!key.trim().startsWith("sk-ant-")) throw { code: "invalid_api_key", message: "bad key shape" };
    state.settings = { ...state.settings, hasApiKey: true };
    return state.settings;
  },
  clear_api_key: () => {
    state.settings = { ...state.settings, hasApiKey: false };
    return state.settings;
  },
  test_api_key: () => ({ ok: state.settings.hasApiKey, message: state.settings.hasApiKey ? "Key works." : "No key saved." }),
  run_extraction: () => runMockJob("extract", 40, ["extracting"]),
  get_capture_config: () => captureConfig(state.settings, state.capture),
  regenerate_capture_token: () => {
    state.capture = { ...state.capture, token: newCaptureToken() };
    return captureConfig(state.settings, state.capture);
  },
};

/** Demo hook for the mock preview: `__neuralMapMock.capture()` in the console fakes a Gemini turn. */
if (typeof window !== "undefined" && import.meta.env.DEV) {
  Object.assign(window, { __neuralMapMock: { capture: (newTurns?: number) => simulateCapture(state.capture, newTurns) } });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const mockTransport: Transport = {
  async invoke<T>(command: string, args: Record<string, unknown>): Promise<T> {
    await delay(LATENCY_MS);
    const handler = handlers[command as CommandName] as ((a: unknown) => unknown) | undefined;
    if (!handler) throw { code: "unknown_command", message: command };
    return handler(args) as T;
  },
  listen: async (event, handler) => mockListen(event, handler),
};
