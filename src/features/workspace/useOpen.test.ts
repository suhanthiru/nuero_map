import { describe, expect, it } from "vitest";
import { isOpenGesture, wantsNewTab, wantsToRight } from "./useOpen";

describe("open gestures", () => {
  it("opens a new tab on Ctrl/Cmd+click or middle-click", () => {
    expect(wantsNewTab({ ctrlKey: true, button: 0 })).toBe(true);
    expect(wantsNewTab({ metaKey: true, button: 0 })).toBe(true);
    expect(wantsNewTab({ button: 1 })).toBe(true);
    expect(wantsNewTab({ button: 0 })).toBe(false);
    expect(wantsNewTab(undefined)).toBe(false);
  });

  it("opens to the right on Ctrl+Alt+click only", () => {
    expect(wantsToRight({ ctrlKey: true, altKey: true, button: 0 })).toBe(true);
    expect(wantsToRight({ metaKey: true, altKey: true })).toBe(true);
    expect(wantsToRight({ ctrlKey: true, button: 0 })).toBe(false);
    expect(wantsToRight({ altKey: true, button: 0 })).toBe(false);
  });

  it("never opens on right-click or the extra mouse buttons", () => {
    expect(isOpenGesture({ button: 0 })).toBe(true);
    expect(isOpenGesture({ button: 1 })).toBe(true);
    expect(isOpenGesture({ button: 2 })).toBe(false);
    expect(isOpenGesture({ button: 3 })).toBe(false);
    // Keyboard events and programmatic opens carry no button.
    expect(isOpenGesture({ ctrlKey: true })).toBe(true);
    expect(isOpenGesture(undefined)).toBe(true);
  });
});
