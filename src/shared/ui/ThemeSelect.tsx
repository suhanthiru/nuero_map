import type { ThemeChoice } from "../../api/contract";
import { useThemeStore } from "../../app/providers/themeStore";
import { SegmentedControl } from "./SegmentedControl";

const OPTIONS: readonly { value: ThemeChoice; label: string }[] = [
  { value: "dark", label: "Dark" },
  { value: "light", label: "Light" },
  { value: "paper", label: "Paper" },
  { value: "paper-dark", label: "Paper dark" },
  { value: "system", label: "Auto" },
];

export function ThemeSelect() {
  const choice = useThemeStore((s) => s.choice);
  const setChoice = useThemeStore((s) => s.setChoice);
  return <SegmentedControl label="Theme" options={OPTIONS} value={choice} onChange={setChoice} size="sm" />;
}
