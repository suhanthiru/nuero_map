import { ACCENTS, useThemeStore, type Accent } from "../../app/providers/themeStore";
import s from "./AccentSelect.module.css";

const LABEL: Readonly<Record<Accent, string>> = {
  violet: "Violet",
  blue: "Blue",
  teal: "Teal",
  orange: "Orange",
  pink: "Pink",
  green: "Green",
};

/** Accent color presets; every one is contrast-checked in both themes. */
export function AccentSelect() {
  const accent = useThemeStore((st) => st.accent);
  const setAccent = useThemeStore((st) => st.setAccent);
  return (
    <div role="radiogroup" aria-label="Accent color" className={s.group}>
      {ACCENTS.map((a) => (
        <button key={a} type="button" role="radio" aria-checked={a === accent} className={s.option} onClick={() => setAccent(a)}>
          <span className={s.swatch} style={{ background: `var(--swatch-${a})` }} aria-hidden />
          {LABEL[a]}
        </button>
      ))}
    </div>
  );
}
