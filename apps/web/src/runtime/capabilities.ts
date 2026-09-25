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

/**
 * Reduces a browser `CapabilityProfile` to the plain booleans the Rust engine's
 * backend-selection rule takes (`enginePreferredBackend` in `src/engine/index.ts`),
 * so browser capability detection and the native engine always agree on which
 * backend a given profile selects. An `unknown` state is treated as unsupported:
 * the engine only ever runs a capability it can positively confirm.
 */
export function toEngineCapabilities(profile: CapabilityProfile): {
  webgpu: boolean;
  wasmSimd: boolean;
  wasmThreads: boolean;
} {
  return {
    webgpu: profile.webgpu === "supported",
    wasmSimd: profile.wasmSimd === "supported",
    wasmThreads: profile.sharedArrayBuffer === "supported" && profile.crossOriginIsolated === "supported",
  };
}

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
    webgpu: supported("navigator" in global && "gpu" in navigator),
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
