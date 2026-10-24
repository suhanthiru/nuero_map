// The outbox: at most one queued snapshot per conversation, kept in chrome.storage.local so it
// survives the service worker being stopped. Every read-modify-write goes through one promise
// chain. The coalescing and cap rules are pure functions, exported for tests.
import "./core.js";
import { KEYS } from "./settings.js";

const core = globalThis.NeuralMapCapture;

export const MAX_QUEUE_BYTES = 4_000_000;
// How many leading turns of a new snapshot must line up inside the queued one to merge them.
const ALIGN_RUN = 3;
const EMPTY_QUEUE = Object.freeze({ seq: 0, items: [] });

/** Wraps a StorageArea so reads and read-modify-writes run strictly one after another. */
export function createSerialStore(area) {
  let tail = Promise.resolve();
  function run(task) {
    const result = tail.then(task);
    tail = result.catch(() => undefined);
    return result;
  }
  return {
    get: (keys) => run(() => area.get(keys)),
    /** fn(current ?? fallback) returns the new value, written back unless it is `current` itself. */
    update: (key, fallback, fn) =>
      run(async () => {
        const current = (await area.get(key))[key] ?? fallback;
        const next = await fn(current);
        if (next !== current) await area.set({ [key]: next });
        return next;
      }),
  };
}

const sameTurn = (a, b) => a.role === b.role && a.text === b.text;

/**
 * Where `incoming` starts inside `queued`: the index in `queued` where the longest run of
 * incoming's first turns lines up, or -1 when its first turn isn't there.
 */
export function alignStart(queuedTurns, incomingTurns) {
  let best = -1;
  let bestRun = 0;
  for (let k = 0; k < queuedTurns.length && bestRun < ALIGN_RUN; k++) {
    let run = 0;
    while (
      run < ALIGN_RUN &&
      run < incomingTurns.length &&
      k + run < queuedTurns.length &&
      sameTurn(queuedTurns[k + run], incomingTurns[run])
    ) {
      run += 1;
    }
    if (run > bestRun) [best, bestRun] = [k, run];
  }
  return best;
}

/**
 * A newer snapshot replaces the queued one, unless the queued one starts earlier: then the
 * queued turns before the overlap are kept in front (and the result trimmed as usual).
 */
export function coalesce(queued, incoming, trim = core.trimSnapshot) {
  const k = alignStart(queued.turns, incoming.turns);
  if (k <= 0) return incoming;
  return trim({
    ...incoming,
    conversation: { ...incoming.conversation, from_start: queued.conversation.from_start ?? null },
    turns: [...queued.turns.slice(0, k), ...incoming.turns],
  });
}

const itemBytes = (snapshot) => core.utf8Length(JSON.stringify(snapshot));

/**
 * Adds a snapshot, coalescing with its conversation's queued one. If the queue then exceeds
 * `maxBytes`, the oldest other items are dropped.
 * @returns {{queue: object, dropped: number}}
 */
export function enqueueItem(queue, snapshot, { now, maxBytes = MAX_QUEUE_BYTES, trim } = {}) {
  const key = snapshot.conversation.source_id;
  const existing = queue.items.find((item) => item.key === key);
  const merged = existing ? coalesce(existing.snapshot, snapshot, trim) : snapshot;
  const seq = queue.seq + 1;
  const item = { key, rev: seq, enqueuedAt: existing?.enqueuedAt ?? now, bytes: itemBytes(merged), snapshot: merged };
  let items = existing ? queue.items.map((i) => (i.key === key ? item : i)) : [...queue.items, item];
  let dropped = 0;
  let total = items.reduce((sum, i) => sum + i.bytes, 0);
  while (total > maxBytes && items.length > 1) {
    const oldest = items.find((i) => i.key !== key);
    items = items.filter((i) => i !== oldest);
    total -= oldest.bytes;
    dropped += 1;
  }
  return { queue: { seq, items }, dropped };
}

/** Removes an item only if it is still the revision that was sent. */
export function removeItem(queue, key, rev) {
  return { ...queue, items: queue.items.filter((item) => !(item.key === key && item.rev === rev)) };
}

/** The durable queue on top of a serial store. Items come out oldest first. */
export function createQueue(store, { now = Date.now, maxBytes = MAX_QUEUE_BYTES } = {}) {
  return {
    async enqueue(snapshot) {
      let dropped = 0;
      await store.update(KEYS.queue, EMPTY_QUEUE, (queue) => {
        const result = enqueueItem(queue, snapshot, { now: now(), maxBytes });
        dropped = result.dropped;
        return result.queue;
      });
      return { dropped };
    },
    async oldest() {
      const queue = (await store.get(KEYS.queue))[KEYS.queue] ?? EMPTY_QUEUE;
      return queue.items[0] ?? null;
    },
    remove: (key, rev) => store.update(KEYS.queue, EMPTY_QUEUE, (queue) => removeItem(queue, key, rev)),
  };
}
