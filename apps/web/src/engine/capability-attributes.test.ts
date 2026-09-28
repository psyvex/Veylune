import { beforeAll, describe, expect, it } from "vitest";
import { applyEngineCapabilityAttributes } from "./capability-attributes.js";
import type { CapabilityProfile } from "../runtime/capabilities";
import { loadEngineForNode as loadEngine } from "./node-loader.js";

/**
 * Proves the full chain from Rust `CapabilityProfile`/backend-selection
 * logic through to a DOM attribute (ADR-013, Stage 0 task 8's acceptance
 * criteria) — a real loaded WASM engine and a real `HTMLElement`, not a
 * mock of either. `main.ts` calls the same function this test calls.
 */

const supportedProfile: CapabilityProfile = {
  webgpu: "supported", wasm: "supported", wasmSimd: "supported", workers: "supported",
  offscreenCanvas: "supported", webCodecs: "supported", webnn: "supported",
  sharedArrayBuffer: "supported", crossOriginIsolated: "supported", persistentStorage: "supported",
};
const unsupportedProfile: CapabilityProfile = {
  webgpu: "unsupported", wasm: "supported", wasmSimd: "unsupported", workers: "unsupported",
  offscreenCanvas: "unsupported", webCodecs: "unsupported", webnn: "unsupported",
  sharedArrayBuffer: "unsupported", crossOriginIsolated: "unsupported", persistentStorage: "unsupported",
};

describe("applyEngineCapabilityAttributes (Rust CapabilityProfile -> DOM, end to end)", () => {
  beforeAll(async () => {
    await loadEngine();
  });

  it("writes the engine version onto the element's dataset", async () => {
    const root = document.createElement("div");
    await applyEngineCapabilityAttributes(root, unsupportedProfile);
    expect(root.dataset.engineVersion).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("selects webgpu when the capability profile reports it supported", async () => {
    const root = document.createElement("div");
    await applyEngineCapabilityAttributes(root, supportedProfile);
    expect(root.dataset.enginePreferredBackend).toBe("webgpu");
  });

  it("falls back to wasm when webgpu is unsupported", async () => {
    const root = document.createElement("div");
    await applyEngineCapabilityAttributes(root, unsupportedProfile);
    expect(root.dataset.enginePreferredBackend).toBe("wasm");
  });
});
