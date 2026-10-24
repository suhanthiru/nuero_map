import { useId, useState, type ReactNode } from "react";
import { ChevronRight, RotateCcw } from "lucide-react";
import s from "./Controls.module.css";

interface SectionProps {
  readonly title: string;
  readonly defaultOpen?: boolean;
  readonly onReset?: () => void;
  readonly children: ReactNode;
}

/** A collapsible settings group with an optional "restore defaults" action. */
export function Section({ title, defaultOpen = false, onReset, children }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();
  return (
    <section className={s.section}>
      <div className={s.sectionHead}>
        <button type="button" className={s.sectionToggle} aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen((o) => !o)}>
          <ChevronRight size={14} aria-hidden className={open ? s.chevronOpen : s.chevron} />
          {title}
        </button>
        {open && onReset && (
          <button type="button" className={s.reset} onClick={onReset} title={`Restore default ${title.toLowerCase()}`} aria-label={`Restore default ${title.toLowerCase()}`}>
            <RotateCcw size={13} aria-hidden />
          </button>
        )}
      </div>
      {open && (
        <div id={bodyId} className={s.sectionBody}>
          {children}
        </div>
      )}
    </section>
  );
}

interface ToggleProps {
  readonly label: string;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly hint?: string;
  readonly disabled?: boolean;
}

export function Toggle({ label, checked, onChange, hint, disabled }: ToggleProps) {
  return (
    <label className={s.row} title={hint}>
      <span className={s.rowLabel}>{label}</span>
      <button type="button" role="switch" aria-checked={checked} aria-label={label} className={s.switch} disabled={disabled} onClick={() => onChange(!checked)}>
        <span className={s.knob} />
      </button>
    </label>
  );
}

interface SliderProps {
  readonly label: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly onChange: (value: number) => void;
  readonly format?: (value: number) => string;
}

export function Slider({ label, value, min, max, step, onChange, format = (v) => String(v) }: SliderProps) {
  const id = useId();
  return (
    <div className={s.slider}>
      <div className={s.sliderHead}>
        <label htmlFor={id}>{label}</label>
        <output htmlFor={id}>{format(value)}</output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ ["--fill" as string]: `${((value - min) / (max - min)) * 100}%` }}
      />
    </div>
  );
}
