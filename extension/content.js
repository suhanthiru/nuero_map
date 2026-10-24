// Gemini content script: watches the open chat, sends a snapshot of its finished turns to the
// service worker whenever that set changes, and saves an anonymized copy of the page's DOM on
// request (for fixing selectors). Loaded after selectors.js and core.js.
(function () {
  "use strict";
  const ns = (globalThis.NeuralMapCapture = globalThis.NeuralMapCapture || {});
  if (ns.capture) return; // already running in this isolated world

  const URL_POLL_MS = 500;
  const DEBOUNCE_MS = 400;
  // While a reply streams the page never goes quiet; still scan this often so the prompt goes out.
  const MAX_WAIT_MS = 2000;
  const RETRY_SEND_MS = 5000;
  // A chat URL that still shows no readable turns after this long is reported as unreadable.
  const NO_TURNS_AFTER_MS = 15000;

  /**
   * @param {{doc?: Document, location?: {href: string}, runtime?: object,
   *          clock?: () => number, timers?: object}} [deps]
   */
  function createCapture({
    doc = globalThis.document,
    location = globalThis.location,
    runtime = globalThis.chrome?.runtime,
    clock = Date.now,
    timers = globalThis,
  } = {}) {
    const tracker = ns.createTracker();
    const lastSent = new Map(); // source_id → fingerprint of the snapshot last handed over
    // Pair element → {sourceId, hash} of what was sent from it. Gemini can briefly show the old
    // chat's turns under the new chat's URL; an element already sent for another chat is
    // skipped until its content changes.
    const sentFor = new WeakMap();
    const reported = new Set();
    let href = location.href;
    let urlSince = clock();
    let observer = null;
    let pollTimer = null;
    let scanTimer = null;
    let scanDueAt = 0;
    let firstChangeAt = 0;
    let stopped = false;

    const api = { start, stop, scan };

    function start() {
      observer = new MutationObserver(onMutations);
      observer.observe(doc.body, { childList: true, subtree: true, characterData: true });
      pollTimer = timers.setInterval(pollUrl, URL_POLL_MS);
      runtime.onMessage?.addListener(onRuntimeMessage);
      setScanTimer(0, true);
      return api;
    }

    function stop() {
      stopped = true;
      observer?.disconnect();
      timers.clearInterval(pollTimer);
      timers.clearTimeout(scanTimer);
      try {
        runtime.onMessage?.removeListener(onRuntimeMessage);
      } catch {
        // The extension context is already gone; nothing left to unhook.
      }
      if (ns.capture === api) delete ns.capture;
    }

    function alive() {
      try {
        return !stopped && !!runtime?.id;
      } catch {
        return false;
      }
    }

    // ---- Scheduling ------------------------------------------------------------------------

    /** One timer; `replace` resets it (debounce), otherwise the earliest due scan wins. */
    function setScanTimer(delay, replace) {
      const at = clock() + delay;
      if (scanTimer !== null && !replace && scanDueAt <= at) return;
      timers.clearTimeout(scanTimer);
      scanDueAt = at;
      scanTimer = timers.setTimeout(runScan, delay);
    }

    function runScan() {
      scanTimer = null;
      firstChangeAt = 0;
      scan();
    }

    function onMutations() {
      const now = clock();
      if (!firstChangeAt) firstChangeAt = now;
      setScanTimer(Math.min(DEBOUNCE_MS, Math.max(0, firstChangeAt + MAX_WAIT_MS - now)), true);
    }

    function pollUrl() {
      if (!alive()) return stop();
      if (location.href === href) return;
      href = location.href;
      urlSince = clock();
      setScanTimer(DEBOUNCE_MS, true);
    }

    // ---- Scanning --------------------------------------------------------------------------

    function scan() {
      if (!alive()) return stop();
      const now = clock();
      const conv = ns.conversationFromUrl(location.href);
      const pairs = ns.findPairs(doc);
      const streaming = ns.isGenerating(doc);
      const items = pairs
        .map((pair, i) => readItem(pair, streaming && i === pairs.length - 1))
        .filter((item) => !isStale(item, conv));
      const { turns, pending } = ns.collectTurns(items, tracker, now);
      if (pending) setScanTimer(ns.LIMITS.stableMs + 100, false);
      if (!conv) return; // nothing is sent until the URL names a chat
      if (!pending) checkReadable(conv, turns, now);
      if (turns.length) sendSnapshot(conv, turns, items);
    }

    function readItem(pair, streaming) {
      return {
        key: pair.key,
        userText: textOf(ns.userTextElements(pair)),
        modelText: textOf(ns.modelTextElements(pair)),
        modelBusy: streaming || ns.isLoading(pair),
      };
    }

    function textOf(elements) {
      const text = elements.map((el) => ns.serialize(el)).filter(Boolean).join("\n\n");
      return ns.clampChars(text, ns.LIMITS.maxTurnChars);
    }

    const itemHash = (item) => ns.fingerprint(`${item.userText}\u0001${item.modelText}`);

    function isStale(item, conv) {
      const sent = sentFor.get(item.key);
      return !!conv && !!sent && sent.sourceId !== conv.sourceId && sent.hash === itemHash(item);
    }

    function sendSnapshot(conv, turns, items) {
      const title = ns.clampChars(ns.readTitle(doc) ?? "", ns.LIMITS.maxTitleChars) || null;
      const snapshot = ns.trimSnapshot({
        conversation: { source_id: conv.sourceId, gem_id: conv.gemId, title, from_start: null },
        turns: turns.map((t) => ({ role: t.role, text: t.text, captured_at: new Date(t.at).toISOString() })),
      });
      const fp = ns.snapshotFingerprint(snapshot);
      if (lastSent.get(conv.sourceId) === fp) return;
      lastSent.set(conv.sourceId, fp);
      const sentKeys = new Set(turns.map((t) => t.key));
      for (const item of items) {
        if (sentKeys.has(item.key)) sentFor.set(item.key, { sourceId: conv.sourceId, hash: itemHash(item) });
      }
      post({ type: "snapshot", payload: snapshot }).catch(() => {
        if (lastSent.get(conv.sourceId) === fp) lastSent.delete(conv.sourceId);
        if (alive()) setScanTimer(RETRY_SEND_MS, false);
      });
    }

    /** Report once per chat when a chat page shows nothing these selectors can read. */
    function checkReadable(conv, turns, now) {
      if (reported.has(conv.sourceId)) return;
      const users = turns.filter((t) => t.role === "user").length;
      const kind = turns.length === 0 ? "no_turns" : users >= 2 && users === turns.length ? "no_model_text" : null;
      if (!kind) return;
      const waited = now - urlSince;
      if (waited < NO_TURNS_AFTER_MS) {
        setScanTimer(NO_TURNS_AFTER_MS - waited + 50, false);
        return;
      }
      reported.add(conv.sourceId);
      post({ type: "no_turns", kind, counts: ns.selectorReport(doc) }).catch(() => reported.delete(conv.sourceId));
    }

    function post(message) {
      try {
        return Promise.resolve(runtime.sendMessage(message));
      } catch (error) {
        stop(); // sendMessage throws once the extension context is invalidated
        return Promise.reject(error);
      }
    }

    function onRuntimeMessage(message, sender, sendResponse) {
      if (sender?.id !== runtime.id || message?.type !== "save_dom_snapshot") return false;
      try {
        sendResponse({ ok: true, bytes: saveDomSnapshot(doc, location, clock()) });
      } catch (error) {
        sendResponse({ ok: false, error: String(error?.message ?? error).slice(0, 200) });
      }
      return false;
    }

    return api;
  }

  // ---- Anonymized DOM snapshots ------------------------------------------------------------

  // Attribute values kept verbatim; every other value becomes filler of the same length.
  const KEPT_ATTRS = new Set([
    "class", "id", "role", "type", "tabindex", "dir", "lang", "hidden", "slot", "style",
    "fonticon", "data-test-id", "data-testid", "data-mat-icon-name", "data-mat-icon-type",
    "aria-hidden", "aria-expanded", "aria-selected", "aria-level", "aria-live", "aria-busy",
    "colspan", "rowspan", "start", "width", "height", "encoding",
  ]);
  const URL_ATTRS = new Set(["src", "href", "action", "poster", "data-src", "xlink:href"]);

  const filler = (text) => text.replace(/\S/gu, "x");

  /** Query strings and fragments go; off-site URLs keep only their origin. */
  function stripUrl(value) {
    const trimmed = value.trim();
    if (/^data:/i.test(trimmed)) return "data:,";
    if (/^blob:/i.test(trimmed)) return "blob:";
    try {
      const url = new URL(trimmed, "https://gemini.google.com/");
      if (url.protocol !== "https:" && url.protocol !== "http:") return "";
      const onSite = url.hostname === "gemini.google.com" || url.hostname.endsWith(".gstatic.com");
      return onSite ? url.origin + url.pathname : `${url.origin}/`;
    } catch {
      return "";
    }
  }

  /** A detached copy of the page: tags, classes and structure kept, all text replaced. */
  function anonymizeDocument(doc) {
    const root = doc.documentElement.cloneNode(true);
    for (const el of root.querySelectorAll("script, noscript, style")) el.remove();
    const walker = doc.createTreeWalker(root, 0x4 | 0x80); // text and comment nodes
    for (let node = walker.nextNode(); node; node = walker.nextNode()) node.data = filler(node.data);
    for (const el of [root, ...root.querySelectorAll("*")]) {
      for (const attr of Array.from(el.attributes)) {
        const name = attr.name.toLowerCase();
        if (URL_ATTRS.has(name)) attr.value = stripUrl(attr.value);
        else if (name === "srcset") attr.value = attr.value.split(",").map((part) => stripUrl(part.trim().split(/\s+/)[0])).join(", ");
        else if (name === "style") attr.value = attr.value.replace(/url\([^)]*\)/gi, "url()");
        else if (!KEPT_ATTRS.has(name) && !name.startsWith("_ng")) attr.value = filler(attr.value);
      }
    }
    return root;
  }

  function snapshotHeader(doc, location, now) {
    const info = {
      captured: new Date(now).toISOString(),
      path: new URL(location.href).pathname.replace(/[A-Za-z0-9_-]{8,}/g, "<id>"),
      generating: ns.isGenerating(doc),
      selectorMatches: ns.selectorReport(doc),
    };
    const json = JSON.stringify(info, null, 2).replace(/--/g, "- -");
    return `<!-- Neural Map: anonymized Gemini DOM snapshot. Text and most attribute values are filler;\n` +
      `scripts and styles are removed. Use it to check selectors.js.\n${json}\n-->\n`;
  }

  /** Downloads the anonymized page as an .html file; returns its size in characters. */
  function saveDomSnapshot(doc, location, now) {
    const html = `<!doctype html>\n${snapshotHeader(doc, location, now)}${anonymizeDocument(doc).outerHTML}\n`;
    const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    const link = doc.createElement("a");
    link.href = url;
    link.download = `gemini-dom-${new Date(now).toISOString().replace(/[:.]/g, "-")}.html`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    return html.length;
  }

  Object.assign(ns, { createCapture, anonymizeDocument, saveDomSnapshot });

  const runtime = globalThis.chrome?.runtime;
  if (globalThis.location?.hostname === "gemini.google.com" && runtime?.id) {
    ns.capture = createCapture({ runtime }).start();
  }
})();
