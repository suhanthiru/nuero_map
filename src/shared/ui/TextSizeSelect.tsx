import { useThemeStore, type TextSize } from "../../app/providers/themeStore";
import { SegmentedControl } from "./SegmentedControl";

const OPTIONS: readonly { value: TextSize; label: string }[] = [
  { value: "md", label: "Default" },
  { value: "lg", label: "Large" },
  { value: "xl", label: "Larger" },
];

export function TextSizeSelect() {
  const textSize = useThemeStore((s) => s.textSize);
  const setTextSize = useThemeStore((s) => s.setTextSize);
  return <SegmentedControl label="Text size" options={OPTIONS} value={textSize} onChange={setTextSize} />;
}
