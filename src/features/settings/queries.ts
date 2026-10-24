import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { call } from "../../api/api";
import type { Settings, SettingsPatch } from "../../api/contract";

export const settingsKeys = { all: ["settings"] as const, capture: ["settings", "capture"] as const };

export function useSettings() {
  return useQuery({ queryKey: settingsKeys.all, queryFn: () => call("get_settings", {}), staleTime: Infinity });
}

function useSettingsMutation<T>(fn: (input: T) => Promise<Settings>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (settings) => client.setQueryData(settingsKeys.all, settings),
  });
}

export function useUpdateSettings() {
  return useSettingsMutation((patch: SettingsPatch) => call("set_settings", { patch }));
}

export function useSaveApiKey() {
  return useSettingsMutation((key: string) => call("set_api_key", { key }));
}

export function useClearApiKey() {
  return useSettingsMutation((_: void) => call("clear_api_key", {}));
}

export function useTestApiKey() {
  return useMutation({ mutationFn: () => call("test_api_key", {}) });
}

export function useRunExtraction() {
  return useMutation({ mutationFn: () => call("run_extraction", {}) });
}

/** Port, token, pairing string and whether the listener is up. Re-read on mount: the port can be taken at any time. */
export function useCaptureConfig() {
  return useQuery({ queryKey: settingsKeys.capture, queryFn: () => call("get_capture_config", {}) });
}

export function useRegenerateCaptureToken() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => call("regenerate_capture_token", {}),
    onSuccess: (config) => client.setQueryData(settingsKeys.capture, config),
  });
}

type CapturePatch = Pick<SettingsPatch, "captureEnabled" | "capturePort">;

/** Turning capture on or off, or moving its port, restarts the listener, so its status is re-read. */
export function useUpdateCaptureSettings() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (patch: CapturePatch) => call("set_settings", { patch }),
    onSuccess: (settings) => {
      client.setQueryData(settingsKeys.all, settings);
      return client.invalidateQueries({ queryKey: settingsKeys.capture });
    },
  });
}
