import { useState } from "react";
import { userMessageOf } from "../../api/errors";
import { Button } from "../../shared/ui/Button";
import { useClearApiKey, useSaveApiKey, useTestApiKey } from "./queries";
import s from "./SettingsPage.module.css";

/** Write-only: the saved key is never shown again, only whether one exists. */
export function ApiKeyField({ hasApiKey }: { readonly hasApiKey: boolean }) {
  const [draft, setDraft] = useState("");
  const save = useSaveApiKey();
  const clear = useClearApiKey();
  const test = useTestApiKey();

  const onSave = () =>
    save.mutate(draft, {
      onSuccess: () => {
        setDraft("");
        test.reset();
      },
    });
  const error = save.error ?? clear.error ?? test.error;

  return (
    <section className={s.section} aria-labelledby="api-key-heading">
      <h2 id="api-key-heading" className={s.heading}>
        Anthropic API key
      </h2>
      <p className={s.help}>
        The only key Neural Map needs. It is stored in Windows Credential Manager, never in a file, and is used for
        idea extraction (Claude Haiku 4.5, batch pricing) and topic synthesis.
      </p>
      <p className={s.status} data-ok={hasApiKey}>
        {hasApiKey ? "A key is saved." : "No key saved yet."}
      </p>
      <form
        className={s.row}
        onSubmit={(e) => {
          e.preventDefault();
          if (draft.trim()) onSave();
        }}
      >
        <input
          className={s.input}
          type="password"
          autoComplete="off"
          spellCheck={false}
          aria-label="API key"
          placeholder={hasApiKey ? "Paste a new key to replace it" : "sk-ant-…"}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <Button type="submit" variant="primary" disabled={!draft.trim() || save.isPending}>
          {save.isPending ? "Saving…" : "Save to keychain"}
        </Button>
      </form>
      <div className={s.row}>
        <Button size="sm" onClick={() => test.mutate()} disabled={!hasApiKey || test.isPending}>
          {test.isPending ? "Testing…" : "Test key"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => clear.mutate()} disabled={!hasApiKey || clear.isPending}>
          Remove key
        </Button>
        {test.data && (
          <span className={s.status} data-ok={test.data.ok} role="status">
            {test.data.message}
          </span>
        )}
      </div>
      {error && (
        <p className={s.error} role="alert">
          {userMessageOf(error)}
        </p>
      )}
    </section>
  );
}
