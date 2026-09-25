import { describe, expect, it } from "vitest";
import {
  engineClampConfidence,
  engineProjectSchemaVersion,
  engineReconstructionProgressFraction,
  enginePreferredBackend,
  engineVersion,
} from "./index.js";
import { loadEngineForNode as loadEngine } from "./node-loader.js";

describe("engine (WASM bridge)", () => {
  it("loads and reports a version", async () => {
    await loadEngine();
    expect(engineVersion()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("matches the project schema version the storage layer expects", async () => {
    await loadEngine();
    expect(engineProjectSchemaVersion()).toBeGreaterThanOrEqual(1);
  });

  it("prefers WebGPU when available, falls back to WASM otherwise", async () => {
    await loadEngine();
    expect(
      enginePreferredBackend({ webgpu: true, wasmSimd: false, wasmThreads: false }, "balanced"),
    ).toBe("webgpu");
    expect(
      enginePreferredBackend({ webgpu: false, wasmSimd: false, wasmThreads: false }, "balanced"),
    ).toBe("wasm");
  });

  it("clamps confidence components into [0, 1]", async () => {
    await loadEngine();
    expect(
      engineClampConfidence({ geometry: -1, texture: 0.5, pose: 2, detail: 0.25 }),
    ).toEqual({ geometry: 0, texture: 0.5, pose: 1, detail: 0.25 });
  });

  it("computes reconstruction progress fraction", async () => {
    await loadEngine();
    expect(engineReconstructionProgressFraction(5, 10)).toBeCloseTo(0.5);
    expect(engineReconstructionProgressFraction(0, 0)).toBe(0);
  });
});
