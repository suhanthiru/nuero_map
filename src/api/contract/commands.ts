import type { EdgeId, GemId, IsoDateTime, JobId, MessageId, SynthesisId, TopicId } from "./ids";
import type { SourceContext } from "./sources";
import type { Gem, TopicFilter, TopicState, TopicSummary } from "./topics";
import type { EdgeEvidence, GraphData, GraphOptions } from "./graph";
import type { SynthesisVersion, TopicPage } from "./synthesis";
import type { ImportEstimate, ImportSource, JobFinished, JobProgress, JobView } from "./jobs";
import type { ApiKeyCheck, CaptureConfig, Settings, SettingsPatch } from "./settings";
import type { MergeSuggestion, SearchHit, TodayShelf } from "./misc";
import type { LocalDate, Review, ReviewId, ReviewWeek } from "./review";
import type { TopicNote, UnlinkedMention } from "./notes";
import type { FolderId, ImportedDocuments, NoteId, VaultFolder, VaultNote, VaultNoteSummary, VaultTree } from "./vault";

type NoArgs = Record<string, never>;

/**
 * Single source of truth for every Tauri command: name, argument object, result.
 * The Rust side (`src-tauri/src/commands`) must match these names and camelCase keys.
 */
export interface Commands {
  estimate_import: { args: { path: string; source: ImportSource }; result: ImportEstimate };
  import_export_zip: {
    args: { path: string; source: ImportSource; expectedConversations: number | null };
    result: JobId;
  };
  list_jobs: { args: NoArgs; result: JobView[] };
  cancel_job: { args: { jobId: JobId }; result: boolean };
  retry_job: { args: { jobId: JobId }; result: boolean };

  list_topics: { args: { filter: TopicFilter }; result: TopicSummary[] };
  get_topic_page: { args: { id: TopicId }; result: TopicPage };
  record_topic_opened: { args: { id: TopicId }; result: null };
  set_topic_state: {
    args: { id: TopicId; state: TopicState; checkInAt: IsoDateTime | null };
    result: TopicSummary;
  };
  rename_topic: { args: { id: TopicId; title: string }; result: TopicSummary };

  regenerate_synthesis: { args: { topicId: TopicId; force: boolean }; result: JobId };
  get_synthesis: { args: { synthesisId: SynthesisId }; result: SynthesisVersion };

  /** A topic with no note yet returns an empty body and `updatedAt: null`. */
  get_topic_note: { args: { topicId: TopicId }; result: TopicNote };
  /** Replaces the whole body. An empty body deletes the note. */
  save_topic_note: { args: { topicId: TopicId; body: string }; result: TopicNote };
  /**
   * Note mentions first (they can be turned into links), then idea mentions from topics
   * not yet connected to this one. At most 50 of each.
   */
  get_unlinked_mentions: { args: { topicId: TopicId }; result: UnlinkedMention[] };

  /** Every folder and note of the user's own notes (bodies left out). */
  get_vault: { args: NoArgs; result: VaultTree };
  /** A null name picks "Untitled", then "Untitled 1", "Untitled 2"… among its siblings. */
  create_folder: { args: { parentId: FolderId | null; name: string | null }; result: VaultFolder };
  /** Fails with `conflict` when a sibling already has the name (ignoring case). */
  rename_folder: { args: { id: FolderId; name: string }; result: VaultFolder };
  /** Into another folder or (null) the top level. A folder can't move into itself or below itself (`invalid_input`). */
  move_folder: { args: { id: FolderId; parentId: FolderId | null }; result: VaultFolder };
  /** Deletes the folder and everything in it. Returns the ids of the notes deleted with it. */
  delete_folder: { args: { id: FolderId }; result: NoteId[] };
  /** A null title picks "Untitled", then "Untitled 1"… in that folder. */
  create_note: { args: { folderId: FolderId | null; title: string | null; body: string }; result: VaultNote };
  get_note: { args: { id: NoteId }; result: VaultNote };
  /** Replaces the whole body. Unlike a topic note, an empty body keeps the note. */
  save_note: { args: { id: NoteId; body: string }; result: VaultNote };
  rename_note: { args: { id: NoteId; title: string }; result: VaultNoteSummary };
  move_note: { args: { id: NoteId; folderId: FolderId | null }; result: VaultNoteSummary };
  delete_note: { args: { id: NoteId }; result: null };
  /**
   * Turns documents into notes in `folderId`: Word .docx (Google Docs downloads as .docx too),
   * .md/.markdown and .txt files, and whole folders and .zip files (a Google Takeout zip
   * works), whose subfolders become folders. A folder that's already there is reused.
   */
  import_documents: { args: { paths: string[]; folderId: FolderId | null }; result: ImportedDocuments };

  pin_gem: { args: { topicId: TopicId; ideaId: string }; result: Gem };
  unpin_gem: { args: { gemId: GemId }; result: null };

  get_graph: { args: { opts: GraphOptions }; result: GraphData };
  get_edge_evidence: { args: { edgeId: EdgeId }; result: EdgeEvidence };
  get_today_shelf: { args: NoArgs; result: TodayShelf };
  search: { args: { query: string; limit: number }; result: SearchHit[] };

  get_source_context: { args: { messageId: MessageId; turns: number }; result: SourceContext };

  list_review_weeks: { args: NoArgs; result: ReviewWeek[] };
  start_review: { args: { weekOf: LocalDate }; result: Review };
  get_review: { args: { id: ReviewId }; result: Review };
  save_review_answer: { args: { reviewId: ReviewId; questionId: string; response: string | null }; result: null };
  /** `answers` maps question ids to responses as last shown; they override autosaves. */
  submit_review: { args: { id: ReviewId; answers: Record<string, string | null> }; result: Review };

  list_merge_suggestions: { args: NoArgs; result: MergeSuggestion[] };
  accept_merge_suggestion: { args: { id: string }; result: TopicSummary };
  reject_merge_suggestion: { args: { id: string }; result: null };

  get_settings: { args: NoArgs; result: Settings };
  set_settings: { args: { patch: SettingsPatch }; result: Settings };
  set_api_key: { args: { key: string }; result: Settings };
  clear_api_key: { args: NoArgs; result: Settings };
  test_api_key: { args: NoArgs; result: ApiKeyCheck };
  run_extraction: { args: NoArgs; result: JobId };
  get_capture_config: { args: NoArgs; result: CaptureConfig };
  regenerate_capture_token: { args: NoArgs; result: CaptureConfig };
}

export type CommandName = keyof Commands;
export type CommandArgs<K extends CommandName> = Commands[K]["args"];
export type CommandResult<K extends CommandName> = Commands[K]["result"];

/** Events the backend emits. Names are snake_case on both sides. */
export interface Events {
  job_progress: JobProgress;
  job_finished: JobFinished;
  topics_changed: { topicIds: TopicId[] };
  capture_received: { conversationId: string; newTurns: number };
  model_download: { done: number; total: number };
}

export type EventName = keyof Events;
