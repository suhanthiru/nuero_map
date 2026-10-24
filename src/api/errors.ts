import type { BackendError } from "./contract";

/** Friendly text for stable backend error codes. Unknown codes fall back to GENERIC. */
export const USER_MESSAGES: Readonly<Record<string, string>> = {
  no_api_key: "Add your Anthropic API key in Settings first.",
  invalid_api_key: "Anthropic rejected the API key. Check it in Settings.",
  rate_limited: "Anthropic is rate limiting requests. The app will retry automatically.",
  bad_zip: "That file doesn't look like a Claude or ChatGPT export zip.",
  unsupported_export: "This export layout isn't supported yet.",
  not_found: "That item no longer exists. It may have been merged or deleted.",
  network: "Couldn't reach the network. Check your connection and try again.",
  model_unavailable: "The embedding model isn't downloaded yet. Keep the app open while it downloads.",
  busy: "Another import is already running.",
  not_available: "Topic summaries arrive in the next update.",
  invalid_input: "That value isn't valid. Check it and try again.",
  conflict: "Something with that name is already in this folder.",
  secrets: "Couldn't reach Windows Credential Manager to read or save your key.",
  cancelled: "Cancelled.",
  refused: "Claude declined this request.",
};

const GENERIC = "Something went wrong. Details are in the log.";

export class AppError extends Error {
  readonly code: string;
  readonly userMessage: string;
  readonly command: string;

  constructor(command: string, code: string, message: string) {
    super(message);
    this.name = "AppError";
    this.command = command;
    this.code = code;
    this.userMessage = USER_MESSAGES[code] ?? GENERIC;
  }
}

function isBackendError(value: unknown): value is BackendError {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as BackendError).code === "string" &&
    typeof (value as BackendError).message === "string"
  );
}

/** Normalize whatever `invoke` rejected with into an AppError. */
export function toAppError(command: string, raw: unknown): AppError {
  if (raw instanceof AppError) return raw;
  if (isBackendError(raw)) return new AppError(command, raw.code, raw.message);
  if (raw instanceof Error) return new AppError(command, "unknown", raw.message);
  return new AppError(command, "unknown", String(raw));
}

export function userMessageOf(error: unknown): string {
  return error instanceof AppError ? error.userMessage : GENERIC;
}
