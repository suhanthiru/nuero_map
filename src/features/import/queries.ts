import { useMutation } from "@tanstack/react-query";
import { call } from "../../api/api";
import type { ImportSource, JobId } from "../../api/contract";

export interface ImportRequest {
  readonly path: string;
  readonly source: ImportSource;
}

export interface StartImportRequest extends ImportRequest {
  /** From the estimate, so parsing progress has a real total. */
  readonly expectedConversations: number | null;
}

export function useEstimateImport() {
  return useMutation({
    mutationFn: ({ path, source }: ImportRequest) => call("estimate_import", { path, source }),
  });
}

export function useStartImport() {
  return useMutation({
    mutationFn: (req: StartImportRequest) => call("import_export_zip", req),
  });
}

export function useCancelJob() {
  return useMutation({
    mutationFn: (jobId: JobId) => call("cancel_job", { jobId }),
  });
}
