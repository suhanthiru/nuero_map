import { openUrl } from "@tauri-apps/plugin-opener";
import { isTauri } from "../../api/transport";

const ALLOWED_PROTOCOLS: ReadonlySet<string> = new Set(["http:", "https:", "mailto:"]);

/** Only web and mail links leave the app; anything else (file:, custom schemes) is refused. */
export function isExternalUrl(url: string): boolean {
  try {
    return ALLOWED_PROTOCOLS.has(new URL(url).protocol);
  } catch {
    return false;
  }
}

/** Opens in the system browser from the desktop app, or a new tab in a plain browser. */
export function openExternal(url: string): void {
  if (!isExternalUrl(url)) return;
  if (isTauri()) void openUrl(url);
  else window.open(url, "_blank", "noopener");
}
