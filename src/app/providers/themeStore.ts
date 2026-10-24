import { create } from "zustand";
import type { ThemeChoice } from "../../api/contract";

const THEME_KEY = "neural-map.theme";
const TEXT_KEY = "neural-map.text-size";
const CHOICES: readonly ThemeChoice[] = ["dark", "light", "paper", "paper-dark", "system"];
/** Choices saved by earlier versions, mapped to their current names. */
const LEGACY: Readonly<Record<string, ThemeChoice>> = { "dark-paper": "paper-dark" };

export type ResolvedTheme = Exclude<ThemeChoice, "system">;
export type TextSize = "md" | "lg" | "xl";
const TEXT_SIZES: readonly TextSize[] = ["md", "lg", "xl"];
const ACCENT_KEY = "neural-map.accent";
const READABLE_KEY = "neural-map.readable-width";

/** Accent presets for the dark and light themes (the paper themes keep their rust). */
export type Accent = "violet" | "blue" | "teal" | "orange" | "pink" | "green";
export const ACCENTS: readonly Accent[] = ["violet", "blue", "teal", "orange", "pink", "green"];

function read<T extends string>(key: string, allowed: readonly T[], fallback: T, legacy: Readonly<Record<string, T>> = {}): T {
  try {
    const stored = window.localStorage.getItem(key);
    const raw = stored !== null && stored in legacy ? legacy[stored] : stored;
    return allowed.includes(raw as T) ? (raw as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable (private mode, blocked); the choice just won't persist.
  }
}

export function resolveTheme(choice: ThemeChoice, prefersDark: boolean): ResolvedTheme {
  if (choice === "system") return prefersDark ? "dark" : "light";
  return choice;
}

interface ThemeState {
  readonly choice: ThemeChoice;
  readonly textSize: TextSize;
  readonly accent: Accent;
  /** Notes-app "readable line length": topic pages keep a comfortable measure instead of filling the pane. */
  readonly readableWidth: boolean;
  setChoice: (choice: ThemeChoice) => void;
  setTextSize: (size: TextSize) => void;
  setAccent: (accent: Accent) => void;
  setReadableWidth: (on: boolean) => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  choice: read(THEME_KEY, CHOICES, "system", LEGACY),
  textSize: read(TEXT_KEY, TEXT_SIZES, "md"),
  accent: read(ACCENT_KEY, ACCENTS, "violet"),
  readableWidth: read(READABLE_KEY, ["on", "off"] as const, "on") === "on",
  setChoice: (choice) => {
    write(THEME_KEY, choice);
    set({ choice });
  },
  setTextSize: (textSize) => {
    write(TEXT_KEY, textSize);
    set({ textSize });
  },
  setAccent: (accent) => {
    write(ACCENT_KEY, accent);
    set({ accent });
  },
  setReadableWidth: (readableWidth) => {
    write(READABLE_KEY, readableWidth ? "on" : "off");
    set({ readableWidth });
  },
}));
