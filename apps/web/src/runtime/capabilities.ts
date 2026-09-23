export type CapabilityState = "supported" | "unsupported" | "unknown";

export interface CapabilityProfile {
  readonly webgpu: CapabilityState;
  readonly wasm: CapabilityState;
  readonly wasmSimd: CapabilityState;
  readonly workers: CapabilityState;
  readonly offscreenCanvas: CapabilityState;
  readonly webCodecs: CapabilityState;
  readonly webnn: CapabilityState;
  readonly sharedArrayBuffer: CapabilityState;
  readonly crossOriginIsolated: CapabilityState;
  readonly persistentStorage: CapabilityState;
}

const supported = (value: boolean): CapabilityState => value ? "supported" : "unsupported";

export function detectCapabilities(): CapabilityProfile {
  const global = globalThis as typeof globalThis & {
    WebAssembly?: unknown;
    Worker?: unknown;
    OffscreenCanvas?: unknown;
    VideoDecoder?: unknown;
    ml?: unknown;
    crossOriginIsolated?: boolean;
  };

  return {
    webgpu: supported("gpu" in global),
    wasm: supported("WebAssembly" in global),
    wasmSimd: "WebAssembly" in global ? "unknown" : "unsupported",
    workers: supported("Worker" in global),
    offscreenCanvas: supported("OffscreenCanvas" in global),
    webCodecs: supported("VideoDecoder" in global),
    webnn: supported("ml" in global),
    sharedArrayBuffer: supported("SharedArrayBuffer" in global),
    crossOriginIsolated: supported(global.crossOriginIsolated === true),
    persistentStorage: "navigator" in global && "storage" in navigator ? "unknown" : "unsupported",
  };
}
