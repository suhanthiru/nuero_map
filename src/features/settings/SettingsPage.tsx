import { useEffect, useState } from "react";
import { SYNTHESIS_MODELS, type Settings, type SynthesisModel } from "../../api/contract";
import { userMessageOf } from "../../api/errors";
import { retentionPreview } from "../../shared/model/decay";
import { Button } from "../../shared/ui/Button";
import { Page } from "../../shared/ui/Page";
import { useThemeStore } from "../../app/providers/themeStore";
import { AccentSelect } from "../../shared/ui/AccentSelect";
import { SegmentedControl } from "../../shared/ui/SegmentedControl";
import { TextSizeSelect } from "../../shared/ui/TextSizeSelect";
import { ThemeSelect } from "../../shared/ui/ThemeSelect";
import { ApiKeyField } from "./ApiKeyField";
import { CapturePairingField } from "./CapturePairingField";
import { useRunExtraction, useSettings, useUpdateSettings } from "./queries";
import s from "./SettingsPage.module.css";

const MODEL_LABELS: Readonly<Record<SynthesisModel, string>> = {
  "claude-opus-5-5": "Opus 5.5 (best)",
  "claude-opus-5": "Opus 5",
  "claude-sonnet-5": "Sonnet 5 (cheaper)",
};
const MIN_HALF_LIFE = 1;
const MAX_HALF_LIFE = 365;

function HalfLifeField({ settings }: { readonly settings: Settings }) {
  const update = useUpdateSettings();
  const [draft, setDraft] = useState(String(settings.halfLifeDays));
  useEffect(() => setDraft(String(settings.halfLifeDays)), [settings.halfLifeDays]);
  const value = Number(draft);
  const valid = Number.isFinite(value) && value >= MIN_HALF_LIFE && value <= MAX_HALF_LIFE;
  const preview = valid ? retentionPreview(value) : [];

  return (
    <section className={s.section} aria-labelledby="half-life-heading">
      <h2 id="half-life-heading" className={s.heading}>
        Fading half-life
      </h2>
      <p className={s.help}>How quickly a topic fades when you stop mentioning it. Opening a topic counts as a small mention.</p>
      <div className={s.row}>
        <input
          className={`${s.input} ${s.narrow}`}
          type="number"
          min={MIN_HALF_LIFE}
          max={MAX_HALF_LIFE}
          aria-label="Half-life in days"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <span className={s.help}>days</span>
        <Button size="sm" disabled={!valid || value === settings.halfLifeDays || update.isPending} onClick={() => update.mutate({ halfLifeDays: value })}>
          Apply
        </Button>
      </div>
      {preview.length > 0 && (
        <p className={s.preview} aria-label="Retention preview">
          {preview.map((p) => `idle ${p.days}d → ${p.percent}%`).join(" · ")}
        </p>
      )}
      {update.error && <p className={s.error}>{userMessageOf(update.error)}</p>}
    </section>
  );
}

function ModelField({ settings }: { readonly settings: Settings }) {
  const update = useUpdateSettings();
  const options = SYNTHESIS_MODELS.map((m) => ({ value: m, label: MODEL_LABELS[m] }));
  return (
    <section className={s.section} aria-labelledby="model-heading">
      <h2 id="model-heading" className={s.heading}>
        Synthesis model
      </h2>
      <p className={s.help}>Writes each topic's "current state" and your weekly review. Extraction always uses Claude Haiku 4.5.</p>
      <SegmentedControl
        label="Synthesis model"
        options={options}
        value={settings.synthesisModel}
        onChange={(synthesisModel) => update.mutate({ synthesisModel })}
        disabled={update.isPending}
      />
    </section>
  );
}

function ExtractionField({ hasApiKey }: { readonly hasApiKey: boolean }) {
  const run = useRunExtraction();
  return (
    <section className={s.section} aria-labelledby="extraction-heading">
      <h2 id="extraction-heading" className={s.heading}>
        Extraction
      </h2>
      <p className={s.help}>Runs automatically after each import. Use this to retry after adding a key or a network problem.</p>
      <div className={s.row}>
        <Button size="sm" onClick={() => run.mutate()} disabled={!hasApiKey || run.isPending}>
          Run extraction now
        </Button>
        {run.isSuccess && <span className={s.status} role="status">Queued.</span>}
      </div>
      {run.error && <p className={s.error}>{userMessageOf(run.error)}</p>}
    </section>
  );
}

function ReadableWidthToggle() {
  const on = useThemeStore((st) => st.readableWidth);
  const set = useThemeStore((st) => st.setReadableWidth);
  return (
    <label className={s.row}>
      <input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} />
      <span className={s.toggleLabel}>Readable line length</span>
      <span className={s.help}>Keep topic pages to a comfortable width instead of filling the pane.</span>
    </label>
  );
}

export function SettingsPage() {
  const settings = useSettings();
  return (
    <Page eyebrow="Settings" title="Settings">
      {settings.isPending && <p className={s.help}>Loading…</p>}
      {settings.error && <p className={s.error}>{userMessageOf(settings.error)}</p>}
      {settings.data && (
        <>
          <ApiKeyField hasApiKey={settings.data.hasApiKey} />
          <ModelField settings={settings.data} />
          <HalfLifeField settings={settings.data} />
          <ExtractionField hasApiKey={settings.data.hasApiKey} />
          <CapturePairingField settings={settings.data} />
          <section className={s.section} aria-labelledby="theme-heading">
            <h2 id="theme-heading" className={s.heading}>
              Appearance
            </h2>
            <p className={s.help}>Theme</p>
            <div className={s.row}>
              <ThemeSelect />
            </div>
            <p className={s.help}>Accent color (dark and light themes; the paper themes keep their rust)</p>
            <div className={s.row}>
              <AccentSelect />
            </div>
            <p className={s.help}>Text size (scales the whole app, including map labels)</p>
            <div className={s.row}>
              <TextSizeSelect />
            </div>
            <ReadableWidthToggle />
            <p className={s.help}>
              Motion follows your system "reduce motion" setting. Keyboard: 1–5 switch screens, / searches the map.
            </p>
          </section>
        </>
      )}
    </Page>
  );
}
