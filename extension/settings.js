// Storage layout and the status → toolbar badge mapping, shared by the service worker, the
// options page and the popup. Everything lives in chrome.storage.local.

export const KEYS = Object.freeze({
  settings: "settings",
  pairing: "pairing", // {port, token}
  status: "status", // written only by the service worker
  queue: "queue",
  resume: "resumeRequest", // the options page bumps this after a passing connection test
});

export const DEFAULT_SETTINGS = Object.freeze({ enabled: true, sendTitles: true });

export const EMPTY_STATUS = Object.freeze({
  paused: null, // {at, reason, message}: nothing is sent until the pairing changes or a test passes
  lastSuccessAt: null,
  lastAccepted: null, // new turns the app took from the last send
  lastError: null, // {at, kind, message}
  noTurns: null, // {at, kind, counts}: a Gemini chat page showed nothing the selectors could read
  overflowAt: null, // the queue hit its cap and dropped its oldest snapshot
  dropped: [], // the last few snapshots the app refused: {at, status, code}
  backoffStep: 0,
  retryAt: 0,
});

export const MAX_DROPPED = 5;

const RED = "#B3261E";
const AMBER = "#8A5300";

/** @param {(keys: string[]) => Promise<object>} get e.g. chrome.storage.local.get */
export async function readState(get) {
  const got = await get([KEYS.settings, KEYS.pairing, KEYS.status, KEYS.queue]);
  return {
    settings: { ...DEFAULT_SETTINGS, ...got[KEYS.settings] },
    pairing: got[KEYS.pairing] ?? null,
    status: { ...EMPTY_STATUS, ...got[KEYS.status] },
    queued: got[KEYS.queue]?.items?.length ?? 0,
  };
}

/** Applies `change(status)` (a partial status) through the serial store; {} writes nothing. */
export function updateStatus(store, change) {
  return store.update(KEYS.status, EMPTY_STATUS, (current) => {
    const status = { ...EMPTY_STATUS, ...current };
    const delta = change(status);
    return Object.keys(delta).length ? { ...status, ...delta } : current;
  });
}

/** Badge text, colour and tooltip. "!" needs the user; "max" and "?" are warnings. */
export function badgeFor(status) {
  const s = { ...EMPTY_STATUS, ...status };
  if (s.paused) return { text: "!", color: RED, title: `Neural Map: ${s.paused.message}` };
  if (s.lastError?.kind === "foreign") return { text: "!", color: RED, title: `Neural Map: ${s.lastError.message}` };
  if (s.overflowAt) {
    return { text: "max", color: AMBER, title: "Neural Map: too many chats waiting to send, so the oldest were dropped. Is the app running?" };
  }
  if (s.noTurns) {
    return { text: "?", color: AMBER, title: "Neural Map: a Gemini chat showed no turns this extension could read. See its options page." };
  }
  return { text: "", color: null, title: "Neural Map: Gemini capture" };
}
