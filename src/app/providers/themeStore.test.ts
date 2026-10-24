import { describe, expect, it } from "vitest";
import { resolveTheme, useThemeStore } from "./themeStore";

describe("resolveTheme", () => {
  it("follows the system preference only when the choice is system", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("paper", true)).toBe("paper");
    expect(resolveTheme("paper-dark", false)).toBe("paper-dark");
  });
});

describe("useThemeStore", () => {
  it("persists the chosen theme", () => {
    useThemeStore.getState().setChoice("paper-dark");

    expect(useThemeStore.getState().choice).toBe("paper-dark");
    expect(window.localStorage.getItem("neural-map.theme")).toBe("paper-dark");
  });
});
