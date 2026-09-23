import type { InferenceBackend } from "./model";

export type InferenceWorkerRequest =
  | { readonly type: "load"; readonly modelKey: string; readonly backend: InferenceBackend }
  | { readonly type: "run"; readonly jobId: string; readonly modelKey: string; readonly input: ArrayBuffer }
  | { readonly type: "unload"; readonly modelKey: string }
  | { readonly type: "cancel"; readonly jobId: string };

export type InferenceWorkerEvent =
  | { readonly type: "ready" }
  | { readonly type: "progress"; readonly jobId: string; readonly completed: number; readonly total: number }
  | { readonly type: "result"; readonly jobId: string; readonly output: ArrayBuffer }
  | { readonly type: "error"; readonly jobId?: string; readonly code: string; readonly message: string };
