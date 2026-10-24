//! Tunable constants in one place. Thresholds are starting points to tune on real data.

/// Characters per token used for rough token estimates before calling the API.
pub const CHARS_PER_TOKEN: f64 = 3.5;

/// Longest title we derive from a conversation's first user message.
pub const MAX_DERIVED_TITLE_CHARS: usize = 80;

/// Conversations per write transaction during import.
pub const IMPORT_BATCH_SIZE: usize = 200;

/// Bytes read from a conversations file when sniffing its shape.
pub const SNIFF_BYTES: usize = 64 * 1024;

/// SQLite busy timeout.
pub const DB_BUSY_TIMEOUT_MS: u64 = 5_000;

/// Minimum gap between persisted/emitted progress updates for one job stage.
pub const PROGRESS_THROTTLE_MS: u64 = 250;

/// How often an idle worker re-checks for delayed (run_after) jobs.
pub const WORKER_IDLE_POLL_SECS: u64 = 5;

/// Backoff for retryable job failures: base * 2^(attempt-1), capped.
pub const RETRY_BASE_SECS: i64 = 30;
pub const RETRY_MAX_SECS: i64 = 30 * 60;

/// Jobs returned by list_jobs.
pub const RECENT_JOBS_LIMIT: u32 = 20;

/// Surrounding turns returned with a source message by default.
pub const DEFAULT_SOURCE_CONTEXT_TURNS: u32 = 3;

pub mod pricing {
    //! USD per million tokens, Message Batches (50% of list), claude-haiku-4-5.
    pub const EXTRACTION_MODEL: &str = "claude-haiku-4-5";
    pub const BATCH_INPUT_PER_MTOK: f64 = 0.50;
    pub const BATCH_OUTPUT_PER_MTOK: f64 = 2.50;
    /// Expected extraction output as a fraction of transcript input.
    pub const OUTPUT_TO_INPUT_RATIO: f64 = 0.12;
    /// Transcript tokens per extraction window, and cached system prompt tokens per window.
    pub const WINDOW_TOKENS: f64 = 24_000.0;
    pub const SYSTEM_PROMPT_TOKENS: f64 = 4_500.0;
    /// Cache reads bill at 10% of input.
    pub const CACHE_READ_FACTOR: f64 = 0.10;
}

pub mod llm {
    //! Anthropic API settings.
    pub const API_BASE_URL: &str = "https://api.anthropic.com";
    pub const API_VERSION: &str = "2023-06-01";
    pub const HTTP_TIMEOUT_SECS: u64 = 300;
    pub const MAX_HTTP_RETRIES: u32 = 4;
    pub const RETRY_BASE_MS: u64 = 1_000;
    pub const RETRY_AFTER_CAP_SECS: u64 = 120;

    pub const EXTRACTION_MODEL: &str = "claude-haiku-4-5";
    pub const EXTRACTION_MAX_TOKENS: u32 = 16_000;
    /// At or below this many pending windows, call the API directly instead of batching.
    pub const DIRECT_WINDOW_LIMIT: usize = 20;
    /// Requests per batch (API limit is 100k / 256 MB; stay well under).
    pub const BATCH_MAX_REQUESTS: usize = 5_000;
    /// First poll delay after submitting a batch, then the poll interval.
    pub const BATCH_FIRST_POLL_SECS: i64 = 60;
    pub const BATCH_POLL_SECS: i64 = 120;
    /// Beta header for `fallbacks: "default"` (server-side refusal fallback).
    pub const FALLBACK_BETA: &str = "server-side-fallback-2026-07-01";
}

pub mod windows {
    //! Extraction window planning.
    /// Target transcript size per extraction request, in estimated tokens.
    pub const TARGET_TOKENS: usize = 24_000;
    /// Messages from the previous window repeated as read-only context.
    pub const OVERLAP_MESSAGES: usize = 2;
    /// Cap on context characters carried over from the previous window.
    pub const OVERLAP_MAX_CHARS: usize = 2_000;
}

pub mod topics {
    //! Topic assignment thresholds (cosine similarity, bge-small-en-v1.5). Tune on real data.
    pub const ASSIGN_BATCH: usize = 64;
    pub const NEAREST_K: usize = 5;
    /// At or above: the idea clearly belongs to that topic.
    pub const ATTACH_SIM: f32 = 0.86;
    /// Gray band floor: close in meaning; join only if the topic names also agree.
    pub const GRAY_SIM: f32 = 0.78;
    pub const LABEL_SIM: f32 = 0.85;
    /// An idea this close to an earlier idea in the same topic is a restatement.
    pub const DUPLICATE_SIM: f32 = 0.95;
    pub const DUPLICATE_K: usize = 8;
    /// Weight of "opened the topic page" relative to an idea mention.
    pub const OPENED_WEIGHT: f64 = 0.25;
    /// Longest note the user can save, in characters (matches `NOTE_MAX_CHARS` on the frontend).
    pub const NOTE_MAX_CHARS: usize = 200_000;
    /// Unlinked mentions returned per kind (note lines, then ideas).
    pub const UNLINKED_MENTIONS_LIMIT: usize = 50;
    /// Shorter titles and aliases are too common as words to look for as mentions.
    pub const MENTION_MIN_CHARS: usize = 2;
}

pub mod vault {
    //! The user's own notes and folders, and documents imported into them.
    /// Longest note title or folder name, in characters (matches `VAULT_NAME_MAX_CHARS` on the frontend).
    pub const NAME_MAX_CHARS: usize = 200;
    /// Largest .docx read, on disk or inside a zip, in bytes.
    pub const MAX_DOC_BYTES: u64 = 50 * 1024 * 1024;
    /// Largest .md or .txt file read, in bytes.
    pub const MAX_TEXT_BYTES: u64 = 20 * 1024 * 1024;
    /// Largest XML part read from inside a .docx once decompressed (a zip bomb stops here).
    pub const MAX_DOCX_XML_BYTES: u64 = 64 * 1024 * 1024;
    /// Files looked at per import, across picked folders and zips.
    pub const MAX_IMPORT_FILES: usize = 10_000;
    /// Characters of note text shown before a search match in its snippet.
    pub const SEARCH_SNIPPET_LEAD: usize = 40;
}

pub mod graph {
    //! Connections, fading, and the Today shelf.
    /// Scale for turning raw decay scores into 0..1 (1 - e^(-score/scale)).
    pub const DECAY_SCALE: f64 = 3.0;
    /// Shared conversations at which a co-occurrence link is (nearly) full strength.
    pub const COOC_SATURATION: f64 = 8.0;
    pub const EXPLICIT_BASE: f64 = 0.55;
    pub const EXPLICIT_STEP: f64 = 0.15;
    pub const SEMANTIC_K: usize = 6;
    pub const SEMANTIC_SIM: f32 = 0.82;
    /// "New connection" ring on the map: first shared moment within this many days.
    pub const RECENT_LINK_DAYS: i64 = 7;
    pub const NEW_LINK_DAYS: i64 = 14;
    pub const EVIDENCE_LIMIT: i64 = 20;
    /// Strength of a connection made only by a `[[link]]` in a note (no chat evidence).
    pub const NOTE_LINK_STRENGTH: f64 = 0.6;
    pub const FADING_LOOKBACK_DAYS: i64 = 21;
    pub const FADING_MIN_PAST: f64 = 0.45;
    pub const SHELF_REPEAT_DAYS: i64 = 3;
}

pub mod review {
    //! The weekly review: a test on one week's ideas, then a study guide from the answers.
    /// Ideas sent to Claude per test, and a character budget for their text.
    pub const MAX_IDEAS: usize = 80;
    pub const MAX_MATERIAL_CHARS: usize = 60_000;
    /// Longest quote shown per idea in the material (the UI always shows it whole).
    pub const MAX_QUOTE_CHARS: usize = 700;
    /// A week with fewer reviewable ideas than this doesn't have enough for a test.
    pub const MIN_IDEAS: usize = 5;
    /// Question counts grow with the week's material, within these bounds.
    pub const IDEAS_PER_MCQ: usize = 2;
    pub const MCQ_RANGE: (usize, usize) = (4, 10);
    pub const IDEAS_PER_FRQ: usize = 12;
    pub const FRQ_RANGE: (usize, usize) = (2, 4);
    /// Weeks offered in the week picker, newest first.
    pub const WEEKS_LISTED: i64 = 8;
    /// Topics named on each week in the picker.
    pub const WEEK_TOP_TOPICS: i64 = 3;
    /// Longest written answer stored and sent for grading.
    pub const MAX_ANSWER_CHARS: usize = 6_000;
    /// Thinking is on, so this covers thinking plus the JSON reply.
    pub const MAX_TOKENS: u32 = 16_000;
    pub const EFFORT: &str = "high";
}

pub mod capture {
    //! Gemini live capture: the listener on 127.0.0.1 that the browser extension posts to.
    /// Extraction waits until captures have been quiet this long...
    pub const DEBOUNCE_SECS: i64 = 300;
    /// ...but never longer than this after the first capture it is waiting on.
    pub const MAX_WAIT_SECS: i64 = 1_200;
    pub const MAX_BODY_BYTES: usize = 2 * 1024 * 1024;
    pub const MAX_TURNS: usize = 200;
    pub const MAX_TURN_CHARS: usize = 200_000;
    pub const MAX_TITLE_CHARS: usize = 300;
    /// One token bucket for every request: burst size and refill per second.
    pub const RATE_BURST: f64 = 30.0;
    pub const RATE_PER_SEC: f64 = 2.0;
    pub const MAX_IN_FLIGHT: usize = 4;
    /// More branch changes than this for one conversation within the window means a
    /// client is flapping; it gets 429 until the window passes.
    pub const BRANCH_CHANGE_LIMIT: usize = 6;
    pub const BRANCH_CHANGE_WINDOW_SECS: u64 = 300;
    /// Captured times may run this far ahead of our clock before they are clamped.
    pub const CLOCK_SKEW_SECS: i64 = 300;
    /// Message seq layout: a first capture starts at SEQ_BASE; a stretch we have not seen
    /// is marked by a jump of GAP_STRIDE, which leaves room to fill it in later.
    pub const SEQ_BASE: i64 = 1 << 20;
    pub const GAP_STRIDE: i64 = 1 << 12;
    /// Rebinding the same port right after a restart can briefly fail.
    pub const BIND_RETRIES: u32 = 5;
    pub const BIND_RETRY_MS: u64 = 100;
    pub const SHUTDOWN_WAIT_MS: u64 = 3_000;
}
