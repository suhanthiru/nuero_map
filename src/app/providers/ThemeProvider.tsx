import { useEffect, useState, type ReactNode } from "react";
import { resolveTheme, useThemeStore } from "./themeStore";

const DARK_QUERY = "(prefers-color-scheme: dark)";

function usePrefersDark(): boolean {
  const [prefersDark, setPrefersDark] = useState(() => window.matchMedia?.(DARK_QUERY).matches ?? false);
  useEffect(() => {
    const media = window.matchMedia?.(DARK_QUERY);
    if (!media) return;
    const onChange = (e: MediaQueryListEvent) => setPrefersDark(e.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);
  return prefersDark;
}

/** Applies the theme, accent, text size and line length as data attributes on <html>; tokens.css does the rest. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const choice = useThemeStore((s) => s.choice);
  const textSize = useThemeStore((s) => s.textSize);
  const accent = useThemeStore((s) => s.accent);
  const readableWidth = useThemeStore((s) => s.readableWidth);
  const prefersDark = usePrefersDark();
  const resolved = resolveTheme(choice, prefersDark);

  useEffect(() => {
    document.documentElement.dataset.theme = resolved;
  }, [resolved]);

  useEffect(() => {
    document.documentElement.dataset.textSize = textSize;
  }, [textSize]);

  useEffect(() => {
    document.documentElement.dataset.accent = accent;
  }, [accent]);

  useEffect(() => {
    document.documentElement.dataset.readable = readableWidth ? "on" : "off";
  }, [readableWidth]);

  return <>{children}</>;
}
