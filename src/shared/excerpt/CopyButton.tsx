import { useEffect, useState } from "react";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { isTauri } from "../../api/transport";
import s from "../ui/Button.module.css";

const CONFIRM_MS = 1500;

export async function copyText(text: string): Promise<void> {
  if (isTauri()) return writeText(text);
  return navigator.clipboard.writeText(text);
}

interface Props {
  readonly text: string;
  readonly label?: string;
}

export function CopyButton({ text, label = "Copy" }: Props) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    if (state === "idle") return;
    const timer = setTimeout(() => setState("idle"), CONFIRM_MS);
    return () => clearTimeout(timer);
  }, [state]);

  const onClick = () => {
    copyText(text).then(
      () => setState("copied"),
      () => setState("failed"),
    );
  };

  return (
    <button type="button" className={`${s.button} ${s.ghost} ${s.small}`} onClick={onClick}>
      {state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : label}
    </button>
  );
}
