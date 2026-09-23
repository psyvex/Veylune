import type { CapabilityProfile } from "../runtime/capabilities";
import type { InferenceBackend } from "./model";

export interface RuntimeSupport {
  readonly backend: InferenceBackend;
  readonly available: boolean;
  readonly reason?: string;
}

export function getRuntimeSupport(capabilities: CapabilityProfile): readonly RuntimeSupport[] {
  return [
    {
      backend: "webgpu",
      available: capabilities.webgpu === "supported",
      ...(capabilities.webgpu !== "supported" ? { reason: "WebGPU is unavailable." } : {}),
    },
    {
      backend: "webnn",
      available: capabilities.webnn === "supported",
      ...(capabilities.webnn !== "supported" ? { reason: "WebNN is unavailable." } : {}),
    },
    {
      backend: "wasm",
      available: capabilities.wasm === "supported",
      ...(capabilities.wasm !== "supported" ? { reason: "WebAssembly is unavailable." } : {}),
    },
  ];
}
