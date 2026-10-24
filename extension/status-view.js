// Plain-language status lines for the options page and the toolbar popup. Every line has a
// word label, so nothing depends on its colour.

const NO_TURNS_TEXT = {
  no_turns: "A Gemini chat page showed no turns this extension could read.",
  no_model_text: "A Gemini chat page showed your prompts but none of Gemini's replies.",
};

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

function countsText(counts) {
  const parts = Object.entries(counts ?? {}).map(([k, v]) => `${k} ${Array.isArray(v) ? v.join("/") : v}`);
  return parts.length ? ` Selector matches: ${parts.join(", ")}.` : "";
}

/**
 * @param {{settings: object, pairing: object|null, status: object, queued: number}} state
 * @returns {{label: string, text: string, tone: "ok"|"warn"|"error"|"muted"}[]}
 */
export function describeStatus(state, { compact = false, formatTime = (ms) => new Date(ms).toLocaleString() } = {}) {
  const { settings, pairing, status, queued } = state;
  const lines = [
    pairing
      ? { label: "Pairing", text: `Paired with Neural Map on port ${pairing.port}`, tone: "ok" }
      : { label: "Pairing", text: "Not paired yet: paste the pairing string from Neural Map.", tone: "warn" },
    settings.enabled
      ? { label: "Capture", text: "On", tone: "ok" }
      : { label: "Capture", text: "Off: Gemini chats are not being sent", tone: "muted" },
  ];
  if (status.paused) lines.push({ label: "Paused", text: status.paused.message, tone: "error" });
  const accepted = status.lastAccepted != null ? ` (${plural(status.lastAccepted, "new turn")})` : "";
  lines.push({
    label: "Last sent",
    text: status.lastSuccessAt ? `${formatTime(status.lastSuccessAt)}${accepted}` : "Nothing sent yet",
    tone: "muted",
  });
  if (queued) lines.push({ label: "Waiting", text: `${plural(queued, "chat")} waiting to send`, tone: "warn" });
  if (status.lastError && !status.paused) {
    lines.push({ label: "Last problem", text: `${status.lastError.message} (${formatTime(status.lastError.at)})`, tone: "error" });
  }
  if (status.overflowAt) {
    lines.push({ label: "Queue full", text: `Too many chats were waiting, so the oldest were dropped (${formatTime(status.overflowAt)}).`, tone: "warn" });
  }
  if (status.noTurns) {
    const what = NO_TURNS_TEXT[status.noTurns.kind] ?? NO_TURNS_TEXT.no_turns;
    const details = compact ? "" : countsText(status.noTurns.counts);
    lines.push({
      label: "Page check",
      text: `${what} Gemini may have changed its page (${formatTime(status.noTurns.at)}). Save a page snapshot from the toolbar button.${details}`,
      tone: "warn",
    });
  }
  if (!compact) {
    for (const d of status.dropped ?? []) {
      lines.push({ label: "Dropped", text: `${formatTime(d.at)}: HTTP ${d.status}${d.code ? ` (${d.code})` : ""}`, tone: "muted" });
    }
  }
  return lines;
}

/** Renders the lines into a <dl> as text only (never HTML). */
export function renderStatus(list, lines) {
  const doc = list.ownerDocument;
  list.replaceChildren(
    ...lines.flatMap(({ label, text, tone }) => {
      const term = doc.createElement("dt");
      term.textContent = label;
      const detail = doc.createElement("dd");
      detail.textContent = text;
      detail.className = `tone-${tone}`;
      return [term, detail];
    }),
  );
}
