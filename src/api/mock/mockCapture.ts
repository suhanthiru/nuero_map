import { CAPTURE_PORT_MAX, CAPTURE_PORT_MIN, type CaptureConfig, type Settings } from "../contract";
import { mockEmit } from "./mockEvents";
import { runMockJob } from "./mockJobs";

/** What the mock listener is doing: the backend's CaptureService, minus the socket. */
export interface MockCaptureState {
  readonly token: string;
  readonly listening: boolean;
  readonly error: string | null;
}

/** A port the mock pretends is taken, so the "in use" status can be seen in the preview. */
export const MOCK_BUSY_PORT = 8080;
const TOKEN_BYTES = 32;
const CAPTURE_STAGES = ["extracting", "assigning", "linking"] as const;

export function newCaptureToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(TOKEN_BYTES));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function isValidCapturePort(port: number): boolean {
  return Number.isInteger(port) && port >= CAPTURE_PORT_MIN && port <= CAPTURE_PORT_MAX;
}

/** Stop, then start on the configured port, as `set_settings` does when capture settings change. */
export function restartListener(settings: Settings, token: string): MockCaptureState {
  if (!settings.captureEnabled) return { token, listening: false, error: null };
  if (settings.capturePort === MOCK_BUSY_PORT) {
    return { token, listening: false, error: `Port ${settings.capturePort} is in use. Pick another port.` };
  }
  return { token, listening: true, error: null };
}

export function captureConfig(settings: Settings, capture: MockCaptureState): CaptureConfig {
  const port = settings.capturePort;
  return { port, token: capture.token, pairing: `nm1:${port}:${capture.token}`, listening: capture.listening, error: capture.error };
}

let mockConversation = 1;

/**
 * What the listener does when the extension posts a turn: says so, then queues the
 * capture pipeline. The real one waits until chatting stops; the mock starts right away.
 */
export function simulateCapture(capture: MockCaptureState, newTurns = 2): boolean {
  if (!capture.listening) return false;
  mockEmit("capture_received", { conversationId: `gemini-mock-${mockConversation++}`, newTurns });
  runMockJob("capture", newTurns, CAPTURE_STAGES);
  return true;
}
