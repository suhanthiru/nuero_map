import type { IsoDateTime, MessageId } from "./ids";

export type SourceApp = "claude" | "chatgpt" | "gemini";
export type Speaker = "user" | "assistant";

/** Points at one original chat message. */
export interface SourceRef {
  readonly messageId: MessageId;
  readonly conversationId: string;
  readonly app: SourceApp;
  readonly speaker: Speaker;
  readonly timestamp: IsoDateTime;
}

/** Verbatim text from a source message. Never summarized. */
export interface Excerpt {
  readonly text: string;
  readonly source: SourceRef;
}

export interface SourceMessage {
  readonly id: MessageId;
  readonly speaker: Speaker;
  readonly text: string;
  readonly timestamp: IsoDateTime;
}

/** A focus message plus a few surrounding turns, for the source drawer. */
export interface SourceContext {
  readonly app: SourceApp;
  readonly conversationId: string;
  readonly conversationTitle: string;
  readonly conversationUrl: string | null;
  readonly focusMessageId: MessageId;
  readonly messages: readonly SourceMessage[];
}
