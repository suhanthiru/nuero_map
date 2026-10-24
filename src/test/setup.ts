import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import { setTransport } from "../api/transport";
import { DEFAULT_SETTINGS, useGraphSettings } from "../features/graph/state/graphSettingsStore";
import { resetWorkspace } from "../features/workspace/workspaceStore";

afterEach(() => {
  cleanup();
  setTransport(null);
  // Stores are module singletons persisted to localStorage; start every test clean.
  window.localStorage.clear();
  useGraphSettings.setState(DEFAULT_SETTINGS);
  resetWorkspace();
});

// jsdom has no 2D canvas; the map's painter skips drawing when there's no context.
HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;

// jsdom has no matchMedia; ThemeProvider and reduced-motion checks need it.
if (!window.matchMedia) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
}

// jsdom has no layout; CodeMirror measures text ranges when it positions the caret and tooltips.
const emptyRects = (() => Object.assign([], { item: () => null })) as unknown as () => DOMRectList;
if (!Range.prototype.getClientRects) Range.prototype.getClientRects = emptyRects;
if (!Range.prototype.getBoundingClientRect) Range.prototype.getBoundingClientRect = () => new DOMRect();
