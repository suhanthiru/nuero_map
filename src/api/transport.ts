import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { EventName, Events } from "./contract";
import { mockTransport } from "./mock/mockTransport";

export type Unlisten = () => void;

export interface Transport {
  invoke<T>(command: string, args: Record<string, unknown>): Promise<T>;
  listen<E extends EventName>(event: E, handler: (payload: Events[E]) => void): Promise<Unlisten>;
}

const tauriTransport: Transport = {
  invoke: (command, args) => invoke(command, args),
  listen: (event, handler) => listen(event, (e) => handler(e.payload as Events[typeof event])),
};

/** True inside the Tauri webview; false in a plain browser (vite dev) and in tests. */
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function chooseTransport(): Transport {
  if (import.meta.env.VITE_MOCK_API === "1") return mockTransport;
  return isTauri() ? tauriTransport : mockTransport;
}

let active: Transport | null = null;

export function transport(): Transport {
  active ??= chooseTransport();
  return active;
}

/** Test hook: swap the transport (pass null to re-detect). */
export function setTransport(next: Transport | null): void {
  active = next;
}
