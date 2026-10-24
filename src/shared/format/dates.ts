const DAY_MS = 86_400_000;

const dateFormat = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" });
const shortDateFormat = new Intl.DateTimeFormat("en", { month: "short", day: "numeric" });
const timeFormat = new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" });

function toDate(iso: string): Date | null {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "Sep 21, 2026", or "Sep 21" when it's in the same year as `now`. */
export function formatDate(iso: string, now: Date = new Date()): string {
  const d = toDate(iso);
  if (!d) return "unknown date";
  return d.getFullYear() === now.getFullYear() ? shortDateFormat.format(d) : dateFormat.format(d);
}

export function formatDateTime(iso: string, now: Date = new Date()): string {
  const d = toDate(iso);
  return d ? `${formatDate(iso, now)}, ${timeFormat.format(d)}` : "unknown date";
}

/** "2:41 PM" on the same day as `now`, otherwise "Oct 22, 2:41 PM". */
export function formatTime(iso: string, now: Date = new Date()): string {
  const d = toDate(iso);
  if (!d) return "unknown time";
  return d.toDateString() === now.toDateString() ? timeFormat.format(d) : formatDateTime(iso, now);
}

/** Whole days between `iso` and `now`, never negative. */
export function daysSince(iso: string, now: Date = new Date()): number {
  const d = toDate(iso);
  if (!d) return 0;
  return Math.max(0, Math.floor((now.getTime() - d.getTime()) / DAY_MS));
}

/** "today", "yesterday", "12d ago", "3mo ago", "2y ago". */
export function relativeDays(iso: string, now: Date = new Date()): string {
  const days = daysSince(iso, now);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 60) return `${days}d ago`;
  if (days < 730) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}
