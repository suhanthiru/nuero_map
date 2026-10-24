// Everything this extension knows about Gemini's markup: one CONFIG of selectors plus the
// small helpers that read the page with them. When Gemini changes its DOM, fix it here.
// Classic script (content script and test import); it only adds to globalThis.NeuralMapCapture.
(function () {
  "use strict";
  const ns = (globalThis.NeuralMapCapture = globalThis.NeuralMapCapture || {});

  const CONFIG = Object.freeze({
    // One user prompt and the model reply to it.
    turnPair: ".conversation-container",
    userHost: "user-query",
    // Never user-query's own text: it also holds a visually hidden "You said" copy.
    userText: "user-query .query-text",
    // Each line of a prompt is its own block; joined with single newlines.
    userLine: ".query-text-line",
    modelHost: "model-response",
    // Tried in order; the first that matches (outside the thinking panel) wins.
    modelText: [".model-response-text .markdown", "model-response .markdown", "message-content"],
    thoughts: "model-thoughts",
    generating: 'mat-icon[fonticon="stop"]',
    loading: "loading-indicator",
    history: "infinite-scroller",
    sidebarTitle: ".conversation.selected .conversation-title",
    // Used when turnPair stops matching: pair these custom elements in document order.
    fallbackTurns: "user-query, model-response",
    // Subtrees left out of turn text: icon ligatures, buttons, thinking, code-block headers.
    skip: [
      "mat-icon", "button", "svg", "script", "style", "template", "model-thoughts",
      ".code-block-decoration", ".cdk-visually-hidden", "[hidden]", '[aria-hidden="true"]',
    ].join(", "),
    // Math: Gemini keeps the TeX source on the element, KaTeX keeps it in an annotation.
    math: "[data-math]",
    mathBlock: ".math-block",
    katex: ".katex",
    katexSource: 'annotation[encoding="application/x-tex"]',
  });

  function isVisible(el) {
    if (typeof el.checkVisibility === "function") {
      return el.checkVisibility({ checkVisibilityCSS: true, visibilityProperty: true });
    }
    const view = el.ownerDocument.defaultView;
    for (let node = el; node && node.nodeType === 1; node = node.parentElement) {
      if (node.hidden) return false;
      const style = view?.getComputedStyle(node);
      if (style && (style.display === "none" || style.visibility === "hidden")) return false;
    }
    return true;
  }

  /** True while Gemini shows the stop button, i.e. the last reply is still streaming. */
  function isGenerating(doc) {
    return Array.from(doc.querySelectorAll(CONFIG.generating)).some(isVisible);
  }

  /**
   * The turn pairs on screen, in rendered order. Each pair has a stable `key` element (used to
   * track it across scans) and a `scope` to search for its text and loading indicator.
   * @returns {{key: Element, user: Element|null, model: Element|null, scope: Element|null}[]}
   */
  function findPairs(doc) {
    const history = doc.querySelector(CONFIG.history);
    let containers = history ? history.querySelectorAll(CONFIG.turnPair) : [];
    if (!containers.length) containers = doc.querySelectorAll(CONFIG.turnPair);
    if (containers.length) {
      return Array.from(containers, (c) => ({
        key: c,
        user: c.querySelector(CONFIG.userHost),
        model: c.querySelector(CONFIG.modelHost),
        scope: c,
      }));
    }
    const pairs = [];
    for (const el of doc.querySelectorAll(CONFIG.fallbackTurns)) {
      const last = pairs[pairs.length - 1];
      if (el.matches(CONFIG.userHost)) pairs.push({ key: el, user: el, model: null, scope: null });
      else if (last && !last.model) last.model = el;
      else pairs.push({ key: el, user: null, model: el, scope: null });
    }
    return pairs;
  }

  function userTextElements(pair) {
    const scope = pair.scope ?? pair.user;
    return scope ? Array.from(scope.querySelectorAll(CONFIG.userText)) : [];
  }

  /** The reply's markdown roots, never anything inside the thinking panel. */
  function modelTextElements(pair) {
    const scope = pair.scope ?? pair.model;
    if (!scope) return [];
    for (const selector of CONFIG.modelText) {
      const found = Array.from(scope.querySelectorAll(selector)).filter((el) => !el.closest(CONFIG.thoughts));
      const outermost = found.filter((el) => !found.some((other) => other !== el && other.contains(el)));
      if (outermost.length) return outermost;
    }
    return [];
  }

  function isLoading(pair) {
    const scope = pair.scope ?? pair.model;
    return !!scope && Array.from(scope.querySelectorAll(CONFIG.loading)).some(isVisible);
  }

  /** "Trip ideas - Gemini" → "Trip ideas"; a bare "Gemini" or "Google Gemini" → null. */
  function titleFromDocumentTitle(raw) {
    const title = String(raw ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^(?:google\s+)?gemini\s*[-–—|:]\s*/i, "")
      .replace(/\s*[-–—|:]\s*(?:google\s+)?gemini$/i, "");
    return title && !/^(?:google\s+)?gemini$/i.test(title) ? title : null;
  }

  /** The open chat's title: the selected sidebar item, else the tab title, else null. */
  function readTitle(doc) {
    const fromSidebar = doc.querySelector(CONFIG.sidebarTitle)?.textContent.replace(/\s+/g, " ").trim();
    return fromSidebar || titleFromDocumentTitle(doc.title);
  }

  /** How many elements each selector matches; numbers only, for "no turns found" reports. */
  function selectorReport(doc) {
    const count = (selector) => doc.querySelectorAll(selector).length;
    return {
      turnPair: count(CONFIG.turnPair),
      userHost: count(CONFIG.userHost),
      userText: count(CONFIG.userText),
      modelHost: count(CONFIG.modelHost),
      modelText: CONFIG.modelText.map(count),
      thoughts: count(CONFIG.thoughts),
      history: count(CONFIG.history),
      sidebarTitle: count(CONFIG.sidebarTitle),
    };
  }

  Object.assign(ns, {
    CONFIG,
    isVisible,
    isGenerating,
    findPairs,
    userTextElements,
    modelTextElements,
    isLoading,
    titleFromDocumentTitle,
    readTitle,
    selectorReport,
  });
})();
