// Options page: paste the pairing string, test the connection, toggle capture, read the status.
// Test connection runs here, in a visible tab, so Chrome can show its local-network prompt.
import { DEFAULT_SETTINGS, KEYS, readState } from "./settings.js";
import { checkHealth, formatPairing, parsePairing } from "./health.js";
import { describeStatus, renderStatus } from "./status-view.js";

const area = chrome.storage.local;
const $ = (id) => document.getElementById(id);
const field = $("pairing");
const testButton = $("test");

const getState = () => readState((keys) => area.get(keys));

async function renderStatusList() {
  renderStatus($("status"), describeStatus(await getState()));
}

async function load() {
  const state = await getState();
  if (state.pairing) field.value = formatPairing(state.pairing);
  $("enabled").checked = state.settings.enabled;
  $("send-titles").checked = state.settings.sendTitles;
  renderStatus($("status"), describeStatus(state));
}

async function saveSetting(name, value) {
  const current = { ...DEFAULT_SETTINGS, ...(await area.get(KEYS.settings))[KEYS.settings] };
  await area.set({ [KEYS.settings]: { ...current, [name]: value } });
}

function showFieldError(message) {
  $("pairing-error").textContent = message;
  if (message) field.setAttribute("aria-invalid", "true");
  else field.removeAttribute("aria-invalid");
}

function showResult(message, tone) {
  const result = $("test-result");
  result.textContent = message;
  result.className = `result tone-${tone}`;
}

async function testConnection() {
  if (testButton.getAttribute("aria-busy") === "true") return;
  const pairing = parsePairing(field.value);
  if (!pairing) {
    showFieldError(
      "That isn't a pairing string. It starts with nm1:, then the port and a 64-character code. Copy it from Neural Map's Settings.",
    );
    showResult("", "muted");
    field.focus();
    return;
  }
  showFieldError("");
  testButton.setAttribute("aria-busy", "true");
  showResult("Testing…", "muted");
  try {
    const stored = (await area.get(KEYS.pairing))[KEYS.pairing];
    if (stored?.port !== pairing.port || stored?.token !== pairing.token) {
      await area.set({ [KEYS.pairing]: pairing });
    }
    const health = await checkHealth(pairing);
    if (health.ok) {
      await area.set({ [KEYS.resume]: Date.now() });
      showResult("Connected: Neural Map is listening and the pairing matches.", "ok");
    } else {
      const hint =
        health.kind === "unreachable"
          ? " If Chrome asked to let this extension reach devices on your local network, choose Allow and test again."
          : "";
      showResult(health.message + hint, "error");
    }
  } catch (error) {
    showResult(`The test failed: ${String(error?.message ?? error).slice(0, 200)}`, "error");
  } finally {
    testButton.removeAttribute("aria-busy");
  }
}

testButton.addEventListener("click", () => void testConnection());
field.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  void testConnection();
});
$("reveal").addEventListener("click", (event) => {
  const reveal = field.type === "password";
  field.type = reveal ? "text" : "password";
  event.currentTarget.setAttribute("aria-pressed", String(reveal));
});
$("enabled").addEventListener("change", (event) => void saveSetting("enabled", event.target.checked));
$("send-titles").addEventListener("change", (event) => void saveSetting("sendTitles", event.target.checked));

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;
  if ([KEYS.status, KEYS.queue, KEYS.settings, KEYS.pairing].some((key) => key in changes)) void renderStatusList();
});

void load();
