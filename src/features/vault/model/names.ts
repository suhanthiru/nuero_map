import { VAULT_NAME_FORBIDDEN, VAULT_NAME_MAX_CHARS } from "../../../api/contract";

export const UNTITLED = "Untitled";

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/;

/** How the backend stores a name: runs of whitespace become one space, ends trimmed. */
export function normalizeName(name: string): string {
  return name.replace(/\s+/g, " ").trim();
}

/** Names compare like this (case and spacing don't matter), so "Plan" and "plan " clash. */
export function nameKey(name: string): string {
  return normalizeName(name).toLowerCase();
}

/** What's wrong with a note title or folder name, in words, or null when it's fine. */
export function nameProblem(name: string): string | null {
  const clean = normalizeName(name);
  if (!clean) return "A name can't be empty.";
  if ([...clean].length > VAULT_NAME_MAX_CHARS) return `A name can be at most ${VAULT_NAME_MAX_CHARS} characters.`;
  const bad = VAULT_NAME_FORBIDDEN.find((c) => clean.includes(c));
  if (bad) return `A name can't contain ${VAULT_NAME_FORBIDDEN.join(" ")}`;
  if (CONTROL.test(clean)) return "A name can't contain control characters.";
  return null;
}

/** `base`, else `base 1`, `base 2`… whichever is free among `taken` (compared by key). */
export function uniqueName(base: string, taken: Iterable<string>): string {
  const used = new Set([...taken].map(nameKey));
  if (!used.has(nameKey(base))) return base;
  for (let n = 1; ; n++) {
    const candidate = `${base} ${n}`;
    if (!used.has(nameKey(candidate))) return candidate;
  }
}
