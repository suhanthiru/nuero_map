import type { SourceApp, SourceContext, SourceMessage, SourceRef, Speaker } from "../../contract";
import { daysAgo } from "../rng";

interface MockConversation {
  readonly id: string;
  readonly app: SourceApp;
  readonly title: string;
  readonly messages: readonly SourceMessage[];
}

function msg(id: string, speaker: Speaker, text: string, days: number): SourceMessage {
  return { id, speaker, text, timestamp: daysAgo(days) };
}

export const MOCK_CONVERSATIONS: readonly MockConversation[] = [
  {
    id: "c-claude-graph",
    app: "claude",
    title: "Neural graph of my chats",
    messages: [
      msg("m1", "user", "I have hundreds of thoughts a day and put them into Claude, ChatGPT and Gemini. What if they became a neural graph where connections get drawn automatically?", 21),
      msg("m2", "assistant", "The graph is the trap and the retrieval is the product. Clicking an edge and seeing the specific excerpts where two ideas touched is the part people will actually use.", 21),
      msg("m3", "user", "How could we make sure topics aren't forgotten and are easy to re-read?", 20),
      msg("m4", "assistant", "Give each topic a state you control: active, parked, done or dead. Parked topics get scheduled check-ins, and dead ones stop nagging you.", 20),
      msg("m5", "user", "And the visual design would be brown and orange paper, kind of based on Zed.", 18),
      msg("m6", "assistant", "Use ink for your words and a lighter rust for AI text, so your own thinking stays the primary signal.", 18),
    ],
  },
  {
    id: "c-chatgpt-decay",
    app: "chatgpt",
    title: "Half-life for fading ideas",
    messages: [
      msg("m7", "user", "Should the decay key off when I said something or when it was imported?", 19),
      msg("m8", "assistant", "Key it off message timestamps. Otherwise every weekly export makes a week of old ideas look freshly hot.", 19),
      msg("m9", "user", "This is basically a stock with an outflow, like in Thinking in Systems.", 9),
      msg("m10", "assistant", "Exactly: each mention is an inflow, time is a constant fractional outflow, and the half-life sets the drain rate.", 9),
    ],
  },
  {
    id: "c-gemini-arm",
    app: "gemini",
    title: "Servo jitter on the wrist joint",
    messages: [
      msg("m11", "user", "The wrist servo jitters whenever the elbow moves. Is it power or signal?", 4),
      msg("m12", "assistant", "Usually power: the elbow servo's inrush sags the rail. Add a bulk capacitor near the servo header and give the servos their own supply.", 4),
      msg("m19", "user", "Could the old laptop in my homelab run the arm's control loop, or is that silly?", 3),
    ],
  },
  {
    id: "c-claude-async",
    app: "claude",
    title: "Why my tokio task hangs",
    messages: [
      msg("m13", "user", "Why does my async function do nothing until I .await it?", 6),
      msg("m14", "assistant", "Rust futures are lazy: calling an async fn only builds a state machine. Nothing runs until something polls it, usually an .await or an executor like tokio::spawn.", 6),
      msg("m15", "user", "Why does holding a std Mutex guard across an await break things?", 6),
      msg("m16", "assistant", "The guard isn't Send, so the future can't move between tokio's worker threads, and while the task is parked the lock stays held, so every other task that needs it stalls. Drop the guard before awaiting, or use tokio::sync::Mutex if you really must hold it.", 6),
      msg("m17", "user", "What does Pin actually guarantee?", 5),
      msg("m18", "assistant", "Pin promises the value won't move in memory again. Async state machines can hold references into themselves, so moving one would leave those references dangling.", 5),
    ],
  },
];

const MESSAGE_INDEX = new Map<string, { conv: MockConversation; index: number }>(
  MOCK_CONVERSATIONS.flatMap((conv) => conv.messages.map((m, index) => [m.id, { conv, index }] as const)),
);

export function sourceRef(messageId: string): SourceRef {
  const hit = MESSAGE_INDEX.get(messageId);
  if (!hit) throw new Error(`mock message ${messageId} not found`);
  const m = hit.conv.messages[hit.index];
  return { messageId, conversationId: hit.conv.id, app: hit.conv.app, speaker: m.speaker, timestamp: m.timestamp };
}

export function messageText(messageId: string): string {
  const hit = MESSAGE_INDEX.get(messageId);
  return hit ? hit.conv.messages[hit.index].text : "";
}

export function sourceContext(messageId: string, turns: number): SourceContext {
  const hit = MESSAGE_INDEX.get(messageId);
  if (!hit) throw { code: "not_found", message: `message ${messageId}` };
  const start = Math.max(0, hit.index - turns);
  const end = Math.min(hit.conv.messages.length, hit.index + turns + 1);
  return {
    app: hit.conv.app,
    conversationId: hit.conv.id,
    conversationTitle: hit.conv.title,
    conversationUrl: null,
    focusMessageId: messageId,
    messages: hit.conv.messages.slice(start, end),
  };
}
