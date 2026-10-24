// The pairing string and the /health check: before the token is ever sent, the listener on the
// port must prove it holds the same token (HMAC over a fresh nonce). Used by the service worker
// and by the options page's Test connection.

export const PAIRING_RE = /^nm1:(\d{1,5}):([0-9A-Fa-f]{64})$/;
export const MIN_PORT = 1024;
export const MAX_PORT = 65535;
export const HEALTH_TIMEOUT_MS = 5000;
const NONCE_BYTES = 16; // 32 hex characters
const PROOF_LABEL = "nm-health-v1";

/** "nm1:<port>:<token>" → {port, token}, or null when it isn't one. */
export function parsePairing(text) {
  const match = PAIRING_RE.exec(String(text ?? "").trim());
  if (!match) return null;
  const port = Number(match[1]);
  if (port < MIN_PORT || port > MAX_PORT) return null;
  return { port, token: match[2] };
}

export function formatPairing({ port, token }) {
  return `nm1:${port}:${token}`;
}

// Always the literal loopback address: "localhost" may resolve elsewhere and isn't in host_permissions.
export const healthUrl = (port, nonce) => `http://127.0.0.1:${port}/health?nonce=${nonce}`;
export const captureUrl = (port) => `http://127.0.0.1:${port}/capture`;

const toHex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

export function makeNonce(cryptoImpl = globalThis.crypto) {
  return toHex(cryptoImpl.getRandomValues(new Uint8Array(NONCE_BYTES)));
}

/** Lowercase hex HMAC-SHA256, keyed by the token string's UTF-8 bytes, of "nm-health-v1\n<nonce>\n<port>". */
export async function computeProof(token, nonce, port, cryptoImpl = globalThis.crypto) {
  const encoder = new TextEncoder();
  const key = await cryptoImpl.subtle.importKey(
    "raw",
    encoder.encode(token),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await cryptoImpl.subtle.sign("HMAC", key, encoder.encode(`${PROOF_LABEL}\n${nonce}\n${port}`));
  return toHex(new Uint8Array(signature));
}

export async function fetchWithTimeout(fetchImpl, url, init, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Asks the listener on `port` to prove it is Neural Map holding `token`. Never sends the token.
 * @returns {Promise<{ok: true} | {ok: false, kind: "unreachable"|"foreign"|"version", message: string}>}
 */
export async function checkHealth({ port, token }, { fetchImpl = globalThis.fetch, cryptoImpl = globalThis.crypto, timeoutMs = HEALTH_TIMEOUT_MS } = {}) {
  const nonce = makeNonce(cryptoImpl);
  let response;
  try {
    response = await fetchWithTimeout(
      fetchImpl,
      healthUrl(port, nonce),
      { method: "GET", cache: "no-store", credentials: "omit", redirect: "error" },
      timeoutMs,
    );
  } catch {
    return {
      ok: false,
      kind: "unreachable",
      message: `Couldn't reach Neural Map on port ${port}. Is the app open with "Pair browser extension" turned on?`,
    };
  }
  let body = null;
  try {
    body = await response.json();
  } catch {
    // Not JSON: not Neural Map.
  }
  if (!response.ok || body?.app !== "neural_map" || body?.ok !== true) {
    return { ok: false, kind: "foreign", message: `Another program is using port ${port}. Pick another port in Neural Map's Settings and paste the new pairing string.` };
  }
  if (body.v !== 1) {
    return { ok: false, kind: "version", message: `Neural Map answered with protocol version ${String(body.v).slice(0, 8)}, which this extension doesn't know. Update the extension.` };
  }
  const expected = await computeProof(token, nonce, port, cryptoImpl);
  if (typeof body.proof !== "string" || body.proof.toLowerCase() !== expected) {
    return {
      ok: false,
      kind: "foreign",
      message: "Another program is using this port, or the pairing string is out of date. Copy a fresh one from Neural Map's Settings.",
    };
  }
  return { ok: true };
}
