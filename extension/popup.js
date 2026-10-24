// Toolbar popup: a short status, a way to the options page, and the DOM snapshot helper.
import { readState } from "./settings.js";
import { describeStatus, renderStatus } from "./status-view.js";

const $ = (id) => document.getElementById(id);

async function render() {
  const state = await readState((keys) => chrome.storage.local.get(keys));
  renderStatus($("status"), describeStatus(state, { compact: true }));
}

/** Asks the Gemini content script in the active tab to download an anonymized DOM snapshot. */
async function saveSnapshot() {
  const result = $("snapshot-result");
  result.textContent = "Saving…";
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const reply = await chrome.tabs.sendMessage(tab.id, { type: "save_dom_snapshot" });
    result.textContent = reply?.ok
      ? `Saved (${Math.ceil(reply.bytes / 1024)} KB) to your downloads.`
      : `Couldn't save the snapshot: ${reply?.error ?? "the page didn't answer"}.`;
  } catch {
    result.textContent =
      "Open a Gemini chat in this tab first. If the extension was just installed or reloaded, reload the Gemini tab too.";
  }
}

$("open-options").addEventListener("click", () => void chrome.runtime.openOptionsPage());
$("snapshot").addEventListener("click", () => void saveSnapshot());
void render();
