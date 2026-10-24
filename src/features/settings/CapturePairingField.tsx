import { useEffect, useState } from "react";
import { CAPTURE_PORT_MAX, CAPTURE_PORT_MIN, type CaptureConfig, type Settings } from "../../api/contract";
import { userMessageOf } from "../../api/errors";
import { CopyButton } from "../../shared/excerpt/CopyButton";
import { Button } from "../../shared/ui/Button";
import { useCaptureConfig, useRegenerateCaptureToken, useUpdateCaptureSettings } from "./queries";
import s from "./SettingsPage.module.css";

const REGENERATE_ID = "capture-regenerate";
const PORT_ERROR_ID = "capture-port-error";

function isValidPort(draft: string): boolean {
  const port = Number(draft);
  return draft.trim() !== "" && Number.isInteger(port) && port >= CAPTURE_PORT_MIN && port <= CAPTURE_PORT_MAX;
}

function statusOf(
  config: CaptureConfig | undefined,
  enabled: boolean,
  loading: boolean,
): { readonly text: string; readonly ok?: boolean } {
  if (!config) return { text: loading ? "Checking…" : "Status unknown." };
  if (config.error) return { text: config.error, ok: false };
  if (config.listening) return { text: `Listening on 127.0.0.1:${config.port}`, ok: true };
  return { text: enabled ? "Not listening yet." : "Off" };
}

function EnableToggle({ enabled }: { readonly enabled: boolean }) {
  const update = useUpdateCaptureSettings();
  return (
    <>
      <label className={s.row}>
        <input
          type="checkbox"
          checked={enabled}
          disabled={update.isPending}
          onChange={(e) => update.mutate({ captureEnabled: e.target.checked })}
        />
        <span className={s.toggleLabel}>Capture Gemini chats</span>
      </label>
      {update.error && (
        <p className={s.error} role="alert">
          {userMessageOf(update.error)}
        </p>
      )}
    </>
  );
}

function PortField({ port }: { readonly port: number }) {
  const update = useUpdateCaptureSettings();
  const [draft, setDraft] = useState(String(port));
  useEffect(() => setDraft(String(port)), [port]);
  const valid = isValidPort(draft);
  const changed = valid && Number(draft) !== port;

  return (
    <>
      <form
        className={s.row}
        onSubmit={(e) => {
          e.preventDefault();
          if (changed) update.mutate({ capturePort: Number(draft) });
        }}
      >
        <label htmlFor="capture-port" className={s.toggleLabel}>
          Port
        </label>
        <input
          id="capture-port"
          className={`${s.input} ${s.narrow}`}
          type="number"
          inputMode="numeric"
          min={CAPTURE_PORT_MIN}
          max={CAPTURE_PORT_MAX}
          aria-invalid={!valid}
          aria-describedby={valid ? undefined : PORT_ERROR_ID}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <Button type="submit" size="sm" disabled={!changed || update.isPending}>
          {update.isPending ? "Saving…" : "Save port"}
        </Button>
        <span className={s.help}>A new port changes the pairing string.</span>
      </form>
      {!valid && (
        <p id={PORT_ERROR_ID} className={s.error}>
          Use a port from {CAPTURE_PORT_MIN} to {CAPTURE_PORT_MAX}.
        </p>
      )}
      {update.error && (
        <p className={s.error} role="alert">
          {userMessageOf(update.error)}
        </p>
      )}
    </>
  );
}

/** The string to paste into the extension, plus Regenerate behind a confirm that says what it breaks. */
function PairingString({ config }: { readonly config: CaptureConfig }) {
  const regenerate = useRegenerateCaptureToken();
  const [confirming, setConfirming] = useState(false);
  const close = () => {
    setConfirming(false);
    document.getElementById(REGENERATE_ID)?.focus();
  };

  return (
    <>
      <div className={s.row}>
        <input
          className={s.input}
          readOnly
          spellCheck={false}
          aria-label="Pairing string"
          value={config.pairing}
          onFocus={(e) => e.currentTarget.select()}
        />
        <CopyButton text={config.pairing} />
        <Button id={REGENERATE_ID} size="sm" variant="ghost" aria-expanded={confirming} onClick={() => setConfirming(!confirming)}>
          Regenerate…
        </Button>
      </div>
      {confirming && (
        <div
          className={s.confirm}
          role="group"
          aria-labelledby="capture-regenerate-warning"
          onKeyDown={(e) => {
            if (e.key !== "Escape") return;
            e.stopPropagation();
            close();
          }}
        >
          <p id="capture-regenerate-warning" className={s.toggleLabel}>
            The extension stops capturing until you paste the new pairing string into its options page.
          </p>
          <div className={s.row}>
            <Button
              size="sm"
              variant="primary"
              autoFocus
              disabled={regenerate.isPending}
              onClick={() => regenerate.mutate(undefined, { onSettled: close })}
            >
              Regenerate token
            </Button>
            <Button size="sm" variant="ghost" onClick={close}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      {regenerate.isSuccess && (
        <p className={s.status} role="status">
          New pairing string ready. Paste it into the extension to reconnect.
        </p>
      )}
      {regenerate.error && (
        <p className={s.error} role="alert">
          {userMessageOf(regenerate.error)}
        </p>
      )}
    </>
  );
}

/** Pairs the Chrome extension with the listener on 127.0.0.1 so Gemini chats arrive as you have them. */
export function CapturePairingField({ settings }: { readonly settings: Settings }) {
  const config = useCaptureConfig();
  const status = statusOf(config.data, settings.captureEnabled, config.isPending);

  return (
    <section className={s.section} aria-labelledby="capture-heading">
      <h2 id="capture-heading" className={s.heading}>
        Gemini live capture
      </h2>
      <p className={s.help}>
        Gemini has no export file, so a Chrome extension sends each Gemini turn here as you chat. It only talks to this
        computer (127.0.0.1). Ideas are extracted about 5 minutes after you stop chatting.
      </p>
      <EnableToggle enabled={settings.captureEnabled} />
      <p className={`${s.status} ${s.statusLine}`} data-ok={status.ok} role="status">
        {status.text}
      </p>
      <PortField port={settings.capturePort} />
      {config.error && (
        <p className={s.error} role="alert">
          {userMessageOf(config.error)}
        </p>
      )}
      <h3 className={s.subheading}>Pair the extension</h3>
      <ol className={s.steps}>
        <li>
          In Chrome, open <code>chrome://extensions</code>, turn on Developer mode, choose Load unpacked and pick the
          app's <code>extension</code> folder.
        </li>
        <li>Open the extension's options page and paste the pairing string below.</li>
        <li>Press Test connection. It should say it reached Neural Map.</li>
      </ol>
      {config.data && <PairingString config={config.data} />}
      <p className={s.help}>
        Opening an older Gemini chat captures the history it shows, dated today: Gemini doesn't show when messages were
        sent.
      </p>
    </section>
  );
}
