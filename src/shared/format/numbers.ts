const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
const whole = new Intl.NumberFormat("en");

/** 1480 → "1,480"; above 100k → "9.2M"-style compact. */
export function formatCount(n: number): string {
  return Math.abs(n) >= 100_000 ? compact.format(n) : whole.format(n);
}

/** Dollars with cents; tiny non-zero amounts show as "< $0.01". */
export function formatUsd(amount: number): string {
  if (amount > 0 && amount < 0.01) return "< $0.01";
  return `$${amount.toFixed(2)}`;
}
