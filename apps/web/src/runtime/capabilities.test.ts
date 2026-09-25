import { describe, expect, it } from "vitest";
import { detectCapabilities, toEngineCapabilities } from "./capabilities";
import { enginePreferredBackend } from "../engine/index.js";
import { loadEngineForNode as loadEngine } from "../engine/node-loader.js";

describe("detectCapabilities", () => {
  it("returns a complete capability profile without browser-specific assumptions", () => {
    const profile = detectCapabilities();

    expect(profile).toEqual(expect.objectContaining({
      webgpu: expect.any(String),
      wasm: expect.any(String),
      wasmSimd: expect.any(String),
      workers: expect.any(String),
      persistentStorage: expect.any(String),
    }));
  });

  it("never reports an unknown capability as unsupported implicitly", () => {
    const profile = detectCapabilities();
    expect(["supported", "unsupported", "unknown"]).toContain(profile.wasmSimd);
    expect(["supported", "unsupported", "unknown"]).toContain(profile.persistentStorage);
  });
});

describe("toEngineCapabilities", () => {
  it("treats unknown as unsupported, never as a positive capability", () => {
    const engineCapabilities = toEngineCapabilities({
      webgpu: "unknown",
      wasm: "supported",
      wasmSimd: "unknown",
      workers: "supported",
      offscreenCanvas: "unknown",
      webCodecs: "unknown",
      webnn: "unknown",
      sharedArrayBuffer: "unknown",
      crossOriginIsolated: "unknown",
      persistentStorage: "unknown",
    });

    expect(engineCapabilities).toEqual({ webgpu: false, wasmSimd: false, wasmThreads: false });
  });

  it("drives the same backend choice the Rust engine makes natively", async () => {
    await loadEngine();

    const withGpu = toEngineCapabilities({
      webgpu: "supported",
      wasm: "supported",
      wasmSimd: "supported",
      workers: "supported",
      offscreenCanvas: "supported",
      webCodecs: "supported",
      webnn: "unsupported",
      sharedArrayBuffer: "supported",
      crossOriginIsolated: "supported",
      persistentStorage: "supported",
    });
    expect(enginePreferredBackend(withGpu, "high")).toBe("webgpu");

    const withoutGpu = toEngineCapabilities({
      webgpu: "unsupported",
      wasm: "supported",
      wasmSimd: "supported",
      workers: "supported",
      offscreenCanvas: "supported",
      webCodecs: "unsupported",
      webnn: "unsupported",
      sharedArrayBuffer: "unsupported",
      crossOriginIsolated: "unsupported",
      persistentStorage: "supported",
    });
    expect(enginePreferredBackend(withoutGpu, "balanced")).toBe("wasm");
  });
});
