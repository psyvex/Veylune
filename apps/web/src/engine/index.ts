// Typed entry point to the Rust/WASM engine (see docs/18-wasm-bridge-contract.md
// and ADR-013). This is the only module in apps/web that should import from
// `./wasm-bridge-gen` directly; everything else goes through the functions
// exported here so the generated bindings can be regenerated or renamed
// without touching call sites.

import initWasm, {
  clamp_confidence,
  engine_version,
  initSync,
  preferred_backend,
  project_schema_version,
  reconstruction_progress_fraction,
  WasmExecutionBackend,
  WasmQualityTier,
} from "./wasm-bridge-gen/veylune_wasm_bridge.js";
import wasmUrl from "./wasm-bridge-gen/veylune_wasm_bridge_bg.wasm?url";

export type QualityTier = "preview" | "balanced" | "high" | "maximum";
export type ExecutionBackend = "webgpu" | "wasm" | "native";

const QUALITY_TO_WASM: Record<QualityTier, WasmQualityTier> = {
  preview: WasmQualityTier.Preview,
  balanced: WasmQualityTier.Balanced,
  high: WasmQualityTier.High,
  maximum: WasmQualityTier.Maximum,
};

const BACKEND_FROM_WASM: Record<WasmExecutionBackend, ExecutionBackend> = {
  [WasmExecutionBackend.WebGpu]: "webgpu",
  [WasmExecutionBackend.Wasm]: "wasm",
  [WasmExecutionBackend.Native]: "native",
};

let loaded = false;
let ready: Promise<void> | null = null;

/**
 * Loads and instantiates the WASM engine by fetching `wasmUrl` through Vite's
 * asset pipeline. Safe to call multiple times. This only works where `fetch`
 * can resolve a relative asset URL against a document base (a real browser,
 * or a worker); for Node-side tooling and tests, use
 * {@link loadEngineFromBytes} instead (see `engine/node-loader.ts`).
 */
export function loadEngine(): Promise<void> {
  if (ready) return ready;
  const pending = initWasm({ module_or_path: wasmUrl }).then(() => {
    loaded = true;
  });
  ready = pending;
  return pending;
}

/**
 * Instantiates the WASM engine from an already-read module or byte buffer,
 * bypassing the fetch `loadEngine` performs. Exists for Node-side callers
 * (tests, future CLI tooling) that read the built .wasm file off disk
 * themselves rather than through a browser asset fetch.
 */
export function loadEngineFromBytes(bytes: BufferSource | WebAssembly.Module): void {
  if (!ready) {
    initSync({ module: bytes });
    loaded = true;
    ready = Promise.resolve();
  }
}

function assertLoaded(): void {
  if (!loaded) {
    throw new Error("veylune engine: loadEngine() must be awaited before use");
  }
}

/** The engine crate's semantic version. */
export function engineVersion(): string {
  assertLoaded();
  return engine_version();
}

/** The project schema version this engine build supports. */
export function engineProjectSchemaVersion(): number {
  assertLoaded();
  return project_schema_version();
}

/** Selects an execution backend using the same rule the native runtime uses. */
export function enginePreferredBackend(
  capabilities: { webgpu: boolean; wasmSimd: boolean; wasmThreads: boolean },
  quality: QualityTier,
): ExecutionBackend {
  assertLoaded();
  const backend = preferred_backend(
    capabilities.webgpu,
    capabilities.wasmSimd,
    capabilities.wasmThreads,
    QUALITY_TO_WASM[quality],
  );
  return BACKEND_FROM_WASM[backend];
}

/** Clamps a confidence vector into `[0, 1]` per component. */
export function engineClampConfidence(confidence: {
  geometry: number;
  texture: number;
  pose: number;
  detail: number;
}): { geometry: number; texture: number; pose: number; detail: number } {
  assertLoaded();
  const [geometry, texture, pose, detail] = clamp_confidence(
    confidence.geometry,
    confidence.texture,
    confidence.pose,
    confidence.detail,
  );
  return { geometry, texture, pose, detail };
}

/** Fraction of reconstruction steps completed, clamped to `[0, 1]`. */
export function engineReconstructionProgressFraction(
  completedSteps: number,
  totalSteps: number,
): number {
  assertLoaded();
  return reconstruction_progress_fraction(completedSteps, totalSteps);
}
