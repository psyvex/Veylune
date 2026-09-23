import { estimateRgbaQuality } from "./quality";
import type { InferenceWorkerRequest } from "./worker-protocol";

export interface QualityWorkerRequest {
  readonly type: "quality";
  readonly jobId: string;
  readonly width: number;
  readonly height: number;
  readonly pixels: ArrayBuffer;
}

const loadedModels = new Set<string>();
const cancelledJobs = new Set<string>();

export type WorkerRequest = InferenceWorkerRequest | QualityWorkerRequest;

export function handleInferenceMessage(request: WorkerRequest): void {
  if (request.type === "quality") {
    const signal = estimateRgbaQuality(new Uint8Array(request.pixels), request.width, request.height);
    self.postMessage({ type: "quality", jobId: request.jobId, signal });
    return;
  }

  if (request.type === "load") {
    loadedModels.add(request.modelKey);
    self.postMessage({ type: "ready" });
    return;
  }

  if (request.type === "unload") {
    loadedModels.delete(request.modelKey);
    return;
  }

  if (request.type === "cancel") {
    cancelledJobs.add(request.jobId);
    return;
  }

  if (!loadedModels.has(request.modelKey)) {
    self.postMessage({ type: "error", jobId: request.jobId, code: "MODEL_NOT_LOADED", message: "The requested model is not loaded." });
    return;
  }

  if (cancelledJobs.delete(request.jobId)) {
    self.postMessage({ type: "error", jobId: request.jobId, code: "CANCELLED", message: "Inference job was cancelled." });
    return;
  }

  self.postMessage({ type: "progress", jobId: request.jobId, completed: 0, total: 1 });

  // The transport is real, but model execution remains an explicit runtime adapter.
  // Never present this byte-preserving path as AI inference.
  self.postMessage({ type: "error", jobId: request.jobId, code: "RUNTIME_UNAVAILABLE", message: "No concrete inference runtime is installed in this build." });
}

if (typeof self !== "undefined") {
  self.addEventListener("message", (event: MessageEvent<WorkerRequest>) => {
    handleInferenceMessage(event.data);
  });
}
