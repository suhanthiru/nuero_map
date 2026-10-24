export type SynthesisModel = "claude-opus-5-5" | "claude-opus-5" | "claude-sonnet-5";
export const SYNTHESIS_MODELS: readonly SynthesisModel[] = ["claude-opus-5-5", "claude-opus-5", "claude-sonnet-5"];

export type ThemeChoice = "dark" | "light" | "paper" | "paper-dark" | "system";

export interface Settings {
  readonly synthesisModel: SynthesisModel;
  readonly halfLifeDays: number;
  readonly hasApiKey: boolean;
  readonly capturePort: number;
  /** Off until the user turns it on in Settings. */
  readonly captureEnabled: boolean;
  readonly embeddingModelReady: boolean;
}

/** The ports the capture listener accepts; anything else is rejected with `invalid_input`. */
export const CAPTURE_PORT_MIN = 1024;
export const CAPTURE_PORT_MAX = 65535;

export interface SettingsPatch {
  readonly synthesisModel?: SynthesisModel;
  readonly halfLifeDays?: number;
  /** Changing this or `capturePort` restarts the capture listener. */
  readonly captureEnabled?: boolean;
  readonly capturePort?: number;
}

/** What the browser extension needs to reach the capture listener on 127.0.0.1. */
export interface CaptureConfig {
  readonly port: number;
  readonly token: string;
  /** `nm1:<port>:<token>`, pasted into the extension's options page. */
  readonly pairing: string;
  readonly listening: boolean;
  /** Why the listener isn't running, e.g. "Port 47831 is in use". */
  readonly error?: string | null;
}

export interface ApiKeyCheck {
  readonly ok: boolean;
  readonly message: string;
}
