import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { isTauri } from "../../api/transport";
import { Button } from "../../shared/ui/Button";
import s from "./ImportPage.module.css";

interface Props {
  readonly path: string | null;
  readonly onPick: (path: string) => void;
  readonly disabled?: boolean;
}

async function pickWithDialog(): Promise<string | null> {
  const picked = await open({
    multiple: false,
    directory: false,
    filters: [{ name: "Chat export", extensions: ["zip", "json"] }],
  });
  return typeof picked === "string" ? picked : null;
}

/** Native file dialog in the app; a path field when running in a plain browser. */
export function ZipPicker({ path, onPick, disabled }: Props) {
  const [typed, setTyped] = useState("");

  if (!isTauri()) {
    return (
      <form
        className={s.pickerRow}
        onSubmit={(e) => {
          e.preventDefault();
          if (typed.trim()) onPick(typed.trim());
        }}
      >
        <input
          className={s.pathInput}
          aria-label="Export path"
          placeholder="C:\Users\you\Downloads\claude-export.zip"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          disabled={disabled}
        />
        <Button type="submit" disabled={disabled || !typed.trim()}>
          Use this file
        </Button>
      </form>
    );
  }

  return (
    <div className={s.pickerRow}>
      <Button
        variant={path ? "default" : "primary"}
        disabled={disabled}
        onClick={() => pickWithDialog().then((p) => p && onPick(p))}
      >
        {path ? "Choose another file" : "Choose export .zip"}
      </Button>
      {path && <code className={s.path}>{path}</code>}
    </div>
  );
}
