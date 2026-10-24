import type { SourceApp, Speaker } from "../../api/contract";

export const APP_LABEL: Readonly<Record<SourceApp, string>> = {
  claude: "Claude",
  chatgpt: "ChatGPT",
  gemini: "Gemini",
};

/** "You" for the user's own words, otherwise the assistant's app name. */
export function speakerLabel(speaker: Speaker, app: SourceApp): string {
  return speaker === "user" ? "You" : APP_LABEL[app];
}
