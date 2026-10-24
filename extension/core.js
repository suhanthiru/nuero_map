// Pure helpers for Gemini capture: turn text, fingerprints, chat ids, completion, trimming.
// Classic script: the content script loads it after selectors.js, and the service worker and
// tests import it for its side effect. It only adds to globalThis.NeuralMapCapture.
(function () {
  "use strict";
  const ns = (globalThis.NeuralMapCapture = globalThis.NeuralMapCapture || {});

  const LIMITS = Object.freeze({
    maxTurns: 200,
    maxBytes: 1_500_000,
    maxTurnChars: 200_000,
    maxTitleChars: 300,
    // A turn is complete once its text has held still across scans this far apart.
    stableMs: 2000,
    // After trimming, prefer to start on a user turn at least this long...
    minLeadChars: 20,
    // ...if one is within this many turns of the cut.
    leadLookahead: 6,
  });
  const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
  // Rough JSON overhead per turn: keys, quotes, role and captured_at.
  const TURN_OVERHEAD_BYTES = 80;
  // Placeholders for verbatim parts (code, tables) while flowing text is cleaned up.
  const RAW_MARK = "\u0000";

  // ---- Text -----------------------------------------------------------------------------

  // Separated from their neighbours by a blank line, like innerText's paragraph margins.
  const PARAGRAPH = new Set(["P", "H1", "H2", "H3", "H4", "H5", "H6", "BLOCKQUOTE", "UL", "OL", "DL", "FIGURE"]);
  const LINE = new Set([
    "DIV", "SECTION", "ARTICLE", "HEADER", "FOOTER", "ASIDE", "NAV", "MAIN", "LI", "DT", "DD",
    "FIGCAPTION", "DETAILS", "SUMMARY", "TR",
  ]);

  /**
   * An element's text, close to innerText: `pre>code` becomes a fenced block, `img` becomes
   * [image], table rows become tab-joined lines, list items get "- " or "1. ".
   * Icons, buttons, hidden text and the thinking panel are left out (CONFIG.skip).
   */
  function serialize(el, config = ns.CONFIG) {
    const raw = [];
    const out = [];
    walk(el, config, out, raw);
    const flow = out
      .join("")
      .replace(/[ \t]+/g, " ")
      .replace(/ *\n */g, "\n");
    return normalize(flow.replace(/\u0000(\d+)\u0000/g, (_, i) => raw[Number(i)]));
  }

  function walk(node, config, out, raw) {
    if (node.nodeType === 3) {
      out.push(node.data.replace(/\u0000/g, "").replace(/\s+/g, " "));
      return;
    }
    if (node.nodeType !== 1) return;
    if (config.skip && node.matches(config.skip)) return;
    if (writeSpecial(node, config, out, raw)) return;
    const tag = node.tagName.toUpperCase();
    const isLine = LINE.has(tag) || (config.userLine && node.matches(config.userLine));
    const gap = PARAGRAPH.has(tag) ? "\n\n" : isLine ? "\n" : "";
    out.push(gap);
    if (tag === "LI") out.push(listMarker(node));
    for (const child of node.childNodes) walk(child, config, out, raw);
    out.push(gap);
  }

  /** Elements written as a whole; returns false for everything else. */
  function writeSpecial(node, config, out, raw) {
    const tag = node.tagName.toUpperCase();
    if (tag === "BR") out.push("\n");
    else if (tag === "IMG") out.push("[image]");
    else if (tag === "HR") out.push("\n\n---\n\n");
    else if (tag === "PRE") out.push(verbatim(fence(node), raw));
    else if (tag === "TABLE") out.push(verbatim(tableText(node, config), raw));
    else if (config.math && node.matches(config.math)) out.push(mathText(node.getAttribute("data-math"), node.matches(config.mathBlock)));
    else if (config.katex && node.matches(config.katex) && node.querySelector(config.katexSource)) {
      out.push(mathText(node.querySelector(config.katexSource).textContent, false));
    } else return false;
    return true;
  }

  function verbatim(text, raw) {
    raw.push(text);
    return `\n\n${RAW_MARK}${raw.length - 1}${RAW_MARK}\n\n`;
  }

  function mathText(tex, block) {
    const source = String(tex ?? "").trim();
    return block ? `\n\n$$${source}$$\n\n` : `$${source}$`;
  }

  function fence(pre) {
    const code = pre.querySelector("code") ?? pre;
    const lang = /(?:^|\s)language-([\w+#.-]+)/.exec(code.getAttribute("class") ?? "")?.[1] ?? "";
    const body = code.textContent.replace(/\n+$/, "");
    const longestRun = Math.max(0, ...(body.match(/`+/g) ?? []).map((run) => run.length));
    const ticks = "`".repeat(Math.max(3, longestRun + 1));
    return `${ticks}${lang}\n${body}\n${ticks}`;
  }

  function tableText(table, config) {
    const rows = table.rows ?? table.querySelectorAll("tr");
    return Array.from(rows, (row) =>
      Array.from(row.cells ?? row.children, (cell) => serialize(cell, config).replace(/\s+/g, " ")).join("\t"),
    ).join("\n");
  }

  function listMarker(li) {
    const list = li.parentElement;
    if (!list || list.tagName.toUpperCase() !== "OL") return "- ";
    const start = Number.parseInt(list.getAttribute("start") ?? "1", 10) || 1;
    const index = Array.from(list.children).filter((el) => el.tagName.toUpperCase() === "LI").indexOf(li);
    return `${start + index}. `;
  }

  /** Line endings, odd spaces and blank-line runs made uniform; indentation is kept. */
  function normalize(text) {
    return String(text ?? "")
      .normalize("NFC")
      .replace(/\r\n?/g, "\n")
      .replace(/ /g, " ")
      .replace(/[​-‍﻿]/g, "")
      .replace(/[ \t]+$/gm, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  /** At most `max` characters (code points, as the server counts them). */
  function clampChars(text, max) {
    if (text.length <= max) return text;
    return Array.from(text).slice(0, max).join("");
  }

  function utf8Length(text) {
    let bytes = 0;
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      if (code < 0x80) bytes += 1;
      else if (code < 0x800) bytes += 2;
      else if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
        bytes += 4;
        i += 1;
      } else bytes += 3;
    }
    return bytes;
  }

  // ---- Fingerprints and ids ---------------------------------------------------------------

  /** cyrb53: a fast 53-bit string hash, only used to skip unchanged snapshots. */
  function fingerprint(text) {
    let h1 = 0xdeadbeef;
    let h2 = 0x41c6ce57;
    for (let i = 0; i < text.length; i++) {
      const ch = text.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
  }

  function snapshotFingerprint(snapshot) {
    const c = snapshot.conversation;
    const turns = snapshot.turns.map((t) => `${t.role}\u0001${t.text}`).join("\u0002");
    return fingerprint(`${c.source_id}\u0003${c.gem_id ?? ""}\u0003${c.title ?? ""}\u0003${turns}`);
  }

  /**
   * The chat a Gemini URL points at: /app/<id>, /app/c/<id> or /gem/<gemId>/<id>, optionally
   * under /u/<n>/. Null for anything else (bare /app, a gem's start page, other hosts).
   * @returns {{sourceId: string, gemId: string|null} | null}
   */
  function conversationFromUrl(href) {
    let url;
    try {
      url = new URL(href);
    } catch {
      return null;
    }
    if (url.protocol !== "https:" || url.hostname !== "gemini.google.com") return null;
    let parts = url.pathname.split("/").filter(Boolean);
    if (parts[0] === "u" && /^\d+$/.test(parts[1] ?? "")) parts = parts.slice(2);
    let sourceId = null;
    let gemId = null;
    if (parts[0] === "app" && parts.length === 2 && parts[1] !== "c") sourceId = parts[1];
    else if (parts[0] === "app" && parts.length === 3 && parts[1] === "c") sourceId = parts[2];
    else if (parts[0] === "gem" && parts.length === 3) [gemId, sourceId] = [parts[1], parts[2]];
    if (!sourceId || !ID_RE.test(sourceId) || (gemId !== null && !ID_RE.test(gemId))) return null;
    return { sourceId, gemId };
  }

  // ---- Completion -------------------------------------------------------------------------

  /**
   * Remembers each turn's text between scans. check() says whether a turn is "complete"
   * (non-empty, not busy, same text on scans at least stableMs apart), "empty" (settled with
   * no text: skip it) or "pending" (still changing). `at` is when it first became complete.
   */
  function createTracker(stableMs = LIMITS.stableMs) {
    const seen = { user: new WeakMap(), model: new WeakMap() };
    return {
      check(key, role, text, busy, now) {
        const map = seen[role];
        if (busy) {
          map.delete(key);
          return { state: "pending" };
        }
        const hash = fingerprint(text);
        const prev = map.get(key);
        if (!prev || prev.hash !== hash) {
          map.set(key, { hash, since: now, at: 0 });
          return { state: "pending" };
        }
        if (now - prev.since < stableMs) return { state: "pending" };
        if (!text) return { state: "empty" };
        if (!prev.at) prev.at = now;
        return { state: "complete", at: prev.at };
      },
    };
  }

  /**
   * The complete turns, in order, from items read off the page. Stops at the first turn still
   * changing, so a snapshot never has a hole; an in-progress pair contributes only its prompt.
   * @param {{key: object, userText: string, modelText: string, modelBusy: boolean}[]} items
   */
  function collectTurns(items, tracker, now) {
    const turns = [];
    for (const item of items) {
      const user = tracker.check(item.key, "user", item.userText, false, now);
      if (user.state === "pending") return { turns, pending: true };
      if (user.state === "complete") turns.push({ role: "user", text: item.userText, at: user.at, key: item.key });
      const model = tracker.check(item.key, "model", item.modelText, item.modelBusy, now);
      if (model.state === "pending") return { turns, pending: true };
      if (model.state === "complete") turns.push({ role: "model", text: item.modelText, at: model.at, key: item.key });
    }
    return { turns, pending: false };
  }

  // ---- Trimming ---------------------------------------------------------------------------

  function turnBytes(turn) {
    return utf8Length(turn.text) + TURN_OVERHEAD_BYTES;
  }

  /**
   * At most maxTurns turns and about maxBytes, cut from the front. After a cut, start on a user
   * turn of at least minLeadChars if one is close by. A trimmed snapshot is never from_start.
   */
  function trimSnapshot(snapshot, limits = LIMITS) {
    const turns = snapshot.turns;
    let bytes = turns.reduce((sum, turn) => sum + turnBytes(turn), 0);
    let start = 0;
    while (start < turns.length - 1 && (turns.length - start > limits.maxTurns || bytes > limits.maxBytes)) {
      bytes -= turnBytes(turns[start]);
      start += 1;
    }
    if (start === 0) return snapshot;
    start = preferredStart(turns, start, limits);
    return {
      ...snapshot,
      conversation: { ...snapshot.conversation, from_start: false },
      turns: turns.slice(start),
    };
  }

  function preferredStart(turns, cut, limits) {
    const end = Math.min(turns.length, cut + limits.leadLookahead);
    let firstUser = -1;
    for (let i = cut; i < end; i++) {
      if (turns[i].role !== "user") continue;
      if (turns[i].text.length >= limits.minLeadChars) return i;
      if (firstUser < 0) firstUser = i;
    }
    return firstUser >= 0 ? firstUser : cut;
  }

  Object.assign(ns, {
    LIMITS,
    ID_RE,
    serialize,
    normalize,
    clampChars,
    utf8Length,
    fingerprint,
    snapshotFingerprint,
    conversationFromUrl,
    createTracker,
    collectTurns,
    trimSnapshot,
  });
})();
