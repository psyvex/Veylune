import { estimateFrameQuality } from "./quality";
import type { InferenceWorkerRequest } from "./worker-protocol";

export function handleInferenceMessage(request: InferenceWorkerRequest): void {
  if (request.type !== "run") return;

  // The worker protocol is ready for a real model runtime. Until a verified
  // model adapter is installed, deterministic image-quality analysis is used
  // instead of pretending that a model is available.
  const bytes = new Uint8Array(request.input);
  const rgbaLength = Math.floor(bytes.length / 4) * 4;
  if (rgbaLength === 0) return;

  const pixels = new ImageData(new Uint8ClampedArray(bytes.buffer, bytes.byteOffset, rgbaLength), Math.max(1, Math.floor(Math.sqrt(rgbaLength / 4))), 0);
  void estimateFrameQuality({ width: pixels.width, height: pixels.height, pixels });
}
