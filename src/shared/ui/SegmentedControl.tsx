import s from "./SegmentedControl.module.css";

interface Option<T extends string> {
  readonly value: T;
  readonly label: string;
}

interface Props<T extends string> {
  readonly label: string;
  readonly options: readonly Option<T>[];
  readonly value: T;
  readonly onChange: (value: T) => void;
  readonly size?: "sm" | "md";
  readonly disabled?: boolean;
}

export function SegmentedControl<T extends string>({ label, options, value, onChange, size = "md", disabled }: Props<T>) {
  return (
    <div role="radiogroup" aria-label={label} className={`${s.group} ${size === "sm" ? s.sm : ""}`}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="radio"
          aria-checked={opt.value === value}
          disabled={disabled}
          className={opt.value === value ? `${s.item} ${s.selected}` : s.item}
          data-value={opt.value}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
