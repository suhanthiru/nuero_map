// Service worker. Every listener is registered synchronously at the top level so Chrome can wake
// the worker for it. Durable state lives in chrome.storage.local; the module-level objects
// below hold only what is fine to lose when Chrome stops the worker.
import "./core.js";
import { KEYS, badgeFor, readState } from "./settings.js";
import { createQueue, createSerialStore } from "./queue.js";
import { FLUSH_ALARM, createFlusher, sanitizeSnapshot } from "./flush.js";

const GEMINI_ORIGIN = "https://gemini.google.com";
const NO_TURNS_KINDS = new Set(["no_turns", "no_model_text"]);
const BADGE_TEXT_COLOR = "#FFFFFF";

const store = createSerialStore(chrome.storage.local);
const queue = createQueue(store);
const flusher = createFlusher({
  store,
  queue,
  alarms: chrome.alarms,
  fetchImpl: (url, init) => fetch(url, init),
  cryptoImpl: crypto,
  extVersion: chrome.runtime.getManifest().version,
});

/** Only this extension's own content script on gemini.google.com may hand over turns. */
export function isTrustedSender(sender, extensionId) {
  return (
    !!sender &&
    sender.id === extensionId &&
    typeof sender.url === "string" &&
    sender.url.startsWith(`${GEMINI_ORIGIN}/`) &&
    (sender.origin === undefined || sender.origin === GEMINI_ORIGIN)
  );
}

async function handleSnapshot(message) {
  const { settings } = await readState(store.get);
  if (!settings.enabled) return { ok: true, queued: false };
  const snapshot = sanitizeSnapshot(message.payload);
  if (!snapshot) return { ok: false, error: "invalid_snapshot" };
  const { dropped } = await queue.enqueue(snapshot);
  const hasModelTurn = snapshot.turns.some((t) => t.role === "model");
  await flusher.setStatus((s) => ({
    ...(dropped ? { overflowAt: Date.now() } : {}),
    ...(s.noTurns && (s.noTurns.kind === "no_turns" || hasModelTurn) ? { noTurns: null } : {}),
  }));
  void flusher.flush();
  return { ok: true, queued: true };
}

/** Selector match counts from an unreadable page: small integers only, never page text. */
function cleanCounts(counts) {
  const out = {};
  for (const [key, value] of Object.entries(counts ?? {}).slice(0, 16)) {
    if (!/^[A-Za-z]{1,32}$/.test(key)) continue;
    if (Number.isInteger(value)) out[key] = value;
    else if (Array.isArray(value)) out[key] = value.filter(Number.isInteger).slice(0, 8);
  }
  return out;
}

async function handleNoTurns(message) {
  if (!NO_TURNS_KINDS.has(message.kind)) return { ok: false };
  await flusher.setStatus(() => ({ noTurns: { at: Date.now(), kind: message.kind, counts: cleanCounts(message.counts) } }));
  return { ok: true };
}

const HANDLERS = { snapshot: handleSnapshot, no_turns: handleNoTurns };

function onMessage(message, sender, sendResponse) {
  if (!isTrustedSender(sender, chrome.runtime.id)) return false;
  const handler = Object.hasOwn(HANDLERS, message?.type) ? HANDLERS[message.type] : null;
  if (!handler) return false;
  handler(message).then(sendResponse, () => sendResponse({ ok: false }));
  return true; // answers asynchronously
}

async function refreshBadge(status) {
  const badge = badgeFor(status ?? (await readState(store.get)).status);
  try {
    await chrome.action.setBadgeText({ text: badge.text });
    if (badge.color) {
      await chrome.action.setBadgeBackgroundColor({ color: badge.color });
      await chrome.action.setBadgeTextColor?.({ color: BADGE_TEXT_COLOR });
    }
    await chrome.action.setTitle({ title: badge.title });
  } catch {
    // The action API can fail while the browser shuts down; the next status change retries.
  }
}

function onStorageChanged(changes, areaName) {
  if (areaName !== "local") return;
  if (changes[KEYS.status]) void refreshBadge(changes[KEYS.status].newValue);
  if (changes[KEYS.pairing] || changes[KEYS.resume]) void flusher.resume().then(flusher.flush);
  else if (changes[KEYS.settings]) void flusher.flush();
}

function wake() {
  void flusher.ensureAlarm();
  void flusher.flush();
  void refreshBadge();
}

/** Content scripts never need storage; keep the token out of their reach where Chrome allows. */
function restrictStorage() {
  try {
    chrome.storage.local.setAccessLevel?.({ accessLevel: "TRUSTED_CONTEXTS" })?.catch?.(() => undefined);
  } catch {
    // Older Chrome only supports access levels for storage.session.
  }
}

chrome.runtime.onMessage.addListener(onMessage);
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === FLUSH_ALARM) void flusher.flush();
});
chrome.storage.onChanged.addListener(onStorageChanged);
chrome.runtime.onStartup.addListener(wake);
chrome.runtime.onInstalled.addListener(wake);
restrictStorage();
void flusher.ensureAlarm();
