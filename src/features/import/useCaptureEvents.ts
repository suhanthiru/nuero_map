import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { create } from "zustand";
import { subscribe } from "../../api/api";
import { notify } from "../workspace/notices";
import { invalidateData } from "./useJobEvents";

interface CaptureState {
  /** When the last Gemini turn arrived in this app session; null until the first one. */
  readonly lastCaptureAt: string | null;
  record: (at: string) => void;
}

export const useCaptureStore = create<CaptureState>((set) => ({
  lastCaptureAt: null,
  record: (at) => set({ lastCaptureAt: at }),
}));

/**
 * Mount once (StatusBar): notes each Gemini capture from the browser extension, says so
 * once per app session (every turn would be noise) and refreshes data for the new chat.
 */
export function useCaptureEvents(): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    const pending = subscribe("capture_received", ({ newTurns }) => {
      if (newTurns <= 0) return;
      const { lastCaptureAt, record } = useCaptureStore.getState();
      record(new Date().toISOString());
      if (lastCaptureAt === null) notify("Captured from Gemini");
      invalidateData(queryClient);
    });
    return () => {
      pending.then((unlisten) => unlisten()).catch(() => undefined);
    };
  }, [queryClient]);
}
