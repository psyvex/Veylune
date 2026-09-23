import { estimateRgbaQuality } from "./quality";
import type { InferenceWorkerRequest } from "./worker-protocol";

export interface QualityWorkerRequest {
  readonly type: "quality";
  readonly jobId: string;
  readonly width: number;
  readonly height: number;
  readonly pixels: ArrayBuffer;
}

export function handleInferenceMessage(request: InferenceWorkerRequest | QualityWorkerRequest): void {
  if (request.type !== "quality") return;

  // This deterministic baseline is intentionally model-free. A verified model
  // adapter can replace it without changing the worker boundary.
  const signal = estimateRgbaQuality(new Uint8Array(request.pixels), request.width, request.height);
  void signal;
}
