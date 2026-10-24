// Sends queued snapshots to the app's /capture endpoint and decides what each response means.
// Nothing here logs: payload text and the token must never reach a console.
import "./core.js";
import { MAX_DROPPED, readState, updateStatus } from "./settings.js";
import { captureUrl, checkHealth, fetchWithTimeout } from "./health.js";

const core = globalThis.NeuralMapCapture;

export const FLUSH_ALARM = "nm-flush";
export const MIN_ALARM_MS = 30_000; // chrome.alarms won't fire sooner
export const MAX_BACKOFF_MS = 300_000;
export const DEFAULT_RETRY_AFTER_MS = 60_000;
export const MAX_RETRY_AFTER_MS = 3_600_000;
export const MAX_BODY_BYTES = 1_900_000; // the app refuses bodies over 2 MiB
const POST_TIMEOUT_MS = 30_000;
const ROLES = new Set(["user", "model"]);

/** What to do with a queued snapshot after the app answered `status`. */
export function classifyResponse(status, retryAfter, now) {
  if (status >= 200 && status < 300) return { action: "remove" };
  if (status === 401 || status === 403) return { action: "pause" };
  if (status === 429) return { action: "wait", delayMs: retryAfterMs(retryAfter, now) };
  if (status === 408 || status >= 500) return { action: "backoff" };
  // 400, 413, 415 and anything else the app will never accept as sent.
  return { action: "drop" };
}

/** Retry-After as delta-seconds or an HTTP date, kept between the alarm minimum and an hour. */
export function retryAfterMs(value, now) {
  const text = String(value ?? "").trim();
  let ms = /^\d+$/.test(text) ? Number(text) * 1000 : Date.parse(text) - now;
  if (!text || !Number.isFinite(ms)) ms = DEFAULT_RETRY_AFTER_MS;
  return Math.min(Math.max(ms, MIN_ALARM_MS), MAX_RETRY_AFTER_MS);
}

/** 30 s, 1, 2, 4, then 5 minutes. */
export const backoffDelay = (step) => Math.min(MIN_ALARM_MS * 2 ** step, MAX_BACKOFF_MS);

const isTimestamp = (value) => typeof value === "string" && Number.isFinite(Date.parse(value));
const charCount = (text) => (text.length <= core.LIMITS.maxTurnChars ? text.length : Array.from(text).length);

/** A clean copy of a snapshot from the content script, or null if anything is off. */
export function sanitizeSnapshot(payload) {
  const c = payload?.conversation;
  if (!c || typeof c.source_id !== "string" || !core.ID_RE.test(c.source_id)) return null;
  if (c.gem_id != null && (typeof c.gem_id !== "string" || !core.ID_RE.test(c.gem_id))) return null;
  const turns = payload.turns;
  if (!Array.isArray(turns) || turns.length === 0 || turns.length > core.LIMITS.maxTurns) return null;
  const clean = [];
  for (const t of turns) {
    if (!ROLES.has(t?.role) || typeof t.text !== "string" || !t.text || !isTimestamp(t.captured_at)) return null;
    if (charCount(t.text) > core.LIMITS.maxTurnChars) return null;
    clean.push({ role: t.role, text: t.text, captured_at: t.captured_at });
  }
  const title = typeof c.title === "string" && c.title ? core.clampChars(c.title, core.LIMITS.maxTitleChars) : null;
  const fromStart = typeof c.from_start === "boolean" ? c.from_start : null;
  return {
    conversation: { source_id: c.source_id, gem_id: c.gem_id ?? null, title, from_start: fromStart },
    turns: clean,
  };
}

export function buildBody(snapshot, { sendTitles }, extVersion) {
  const c = snapshot.conversation;
  return {
    v: 1,
    source: "gemini",
    conversation: {
      source_id: c.source_id,
      gem_id: c.gem_id ?? null,
      title: sendTitles ? (c.title ?? null) : null,
      from_start: c.from_start ?? null,
    },
    turns: snapshot.turns.map((t) => ({ role: t.role, text: t.text, captured_at: t.captured_at })),
    client: { ext_version: extVersion },
  };
}

/** The JSON body, dropping leading turns in the rare case escaping pushes it over the limit. */
export function encodeBody(snapshot, settings, extVersion, maxBytes = MAX_BODY_BYTES) {
  let current = snapshot;
  for (;;) {
    const json = JSON.stringify(buildBody(current, settings, extVersion));
    if (core.utf8Length(json) <= maxBytes || current.turns.length <= 1) return json;
    const cut = Math.max(1, Math.ceil(current.turns.length / 10));
    current = {
      conversation: { ...current.conversation, from_start: false },
      turns: current.turns.slice(cut),
    };
  }
}

async function readError(response) {
  try {
    const body = await response.json();
    return typeof body?.code === "string" ? body.code.slice(0, 64) : null;
  } catch {
    return null;
  }
}

/**
 * @param {{store: object, queue: object, alarms: object, fetchImpl: Function,
 *          cryptoImpl?: Crypto, now?: () => number, extVersion: string}} deps
 */
export function createFlusher({ store, queue, alarms, fetchImpl, cryptoImpl, now = Date.now, extVersion }) {
  // The pairing /health has vouched for in this worker's lifetime ("port:token").
  let verified = null;
  let running = null;
  let again = false;

  const setStatus = (change) => updateStatus(store, change);

  function scheduleAlarm(ms) {
    return alarms.create(FLUSH_ALARM, { delayInMinutes: Math.max(ms, MIN_ALARM_MS) / 60_000 });
  }

  /** Sends until the queue is empty or something says stop. Concurrent calls share one run. */
  function flush() {
    if (running) {
      again = true;
      return running;
    }
    running = (async () => {
      do {
        again = false;
        try {
          await run();
        } catch (error) {
          const message = `Unexpected error while sending: ${String(error?.message ?? error).slice(0, 200)}`;
          await setStatus(() => ({ lastError: { at: now(), kind: "internal", message } })).catch(() => undefined);
        }
      } while (again);
    })().finally(() => {
      running = null;
    });
    return running;
  }

  async function run() {
    const { settings, pairing, status } = await readState(store.get);
    if (!settings.enabled || !pairing || status.paused) return;
    if (status.retryAt > now()) {
      await scheduleAlarm(status.retryAt - now());
      return;
    }
    if (!(await ensureHealthy(pairing))) return;
    for (;;) {
      const item = await queue.oldest();
      if (!item) {
        await alarms.clear(FLUSH_ALARM);
        const latest = await readState(store.get);
        if (latest.status.overflowAt) await setStatus(() => ({ overflowAt: null }));
        return;
      }
      if (!(await send(pairing, item, settings))) return;
    }
  }

  async function ensureHealthy(pairing) {
    const id = `${pairing.port}:${pairing.token}`;
    if (verified === id) return true;
    const health = await checkHealth(pairing, { fetchImpl, cryptoImpl });
    if (health.ok) {
      verified = id;
      return true;
    }
    await backoff({ kind: health.kind, message: health.message });
    return false;
  }

  /** Posts one item; true to carry on with the next. */
  async function send(pairing, item, settings) {
    let response;
    try {
      response = await fetchWithTimeout(
        fetchImpl,
        captureUrl(pairing.port),
        {
          method: "POST",
          headers: { Authorization: `Bearer ${pairing.token}`, "Content-Type": "application/json" },
          body: encodeBody(item.snapshot, settings, extVersion),
          cache: "no-store",
          credentials: "omit",
          redirect: "error",
        },
        POST_TIMEOUT_MS,
      );
    } catch {
      verified = null; // whatever holds the port now must prove itself again
      await backoff({ kind: "unreachable", message: `Couldn't reach Neural Map on port ${pairing.port}. Will retry.` });
      return false;
    }
    const verdict = classifyResponse(response.status, response.headers.get("Retry-After"), now());
    if (verdict.action === "remove") {
      const body = await response.json().catch(() => null);
      await queue.remove(item.key, item.rev);
      const accepted = Number.isInteger(body?.accepted) ? body.accepted : null;
      await setStatus(() => ({ lastSuccessAt: now(), lastAccepted: accepted, lastError: null, backoffStep: 0, retryAt: 0 }));
      return true;
    }
    if (verdict.action === "drop") {
      const code = await readError(response);
      await queue.remove(item.key, item.rev);
      const message = `Neural Map refused a snapshot (HTTP ${response.status}${code ? `, ${code}` : ""}), so it was dropped.`;
      await setStatus((s) => ({
        dropped: [{ at: now(), status: response.status, code }, ...s.dropped].slice(0, MAX_DROPPED),
        lastError: { at: now(), kind: "rejected", message },
      }));
      return true;
    }
    if (verdict.action === "pause") {
      const message = `Neural Map rejected the pairing (HTTP ${response.status}). Paste a fresh pairing string and test the connection.`;
      await setStatus(() => ({ paused: { at: now(), reason: "auth", message }, lastError: { at: now(), kind: "auth", message } }));
      return false;
    }
    if (verdict.action === "wait") {
      const retryAt = now() + verdict.delayMs;
      const message = `Neural Map asked to slow down; retrying at ${new Date(retryAt).toLocaleTimeString()}.`;
      await setStatus(() => ({ retryAt, lastError: { at: now(), kind: "rate_limited", message } }));
      await scheduleAlarm(verdict.delayMs);
      return false;
    }
    await backoff({ kind: "server", message: `Neural Map had a problem (HTTP ${response.status}). Will retry.` });
    return false;
  }

  async function backoff(error) {
    let delay = MIN_ALARM_MS;
    await setStatus((s) => {
      delay = backoffDelay(s.backoffStep);
      return { backoffStep: s.backoffStep + 1, retryAt: now() + delay, lastError: { at: now(), ...error } };
    });
    await scheduleAlarm(delay);
  }

  /** After the pairing changes or a connection test passes: clear the pause and retry now. */
  async function resume() {
    verified = null;
    await setStatus(() => ({ paused: null, lastError: null, backoffStep: 0, retryAt: 0 }));
  }

  /** On worker start: make sure a waiting queue has an alarm to flush it. */
  async function ensureAlarm() {
    if (!(await queue.oldest()) || (await alarms.get(FLUSH_ALARM))) return;
    const { status } = await readState(store.get);
    await scheduleAlarm(status.retryAt - now());
  }

  return { flush, resume, ensureAlarm, setStatus };
}
