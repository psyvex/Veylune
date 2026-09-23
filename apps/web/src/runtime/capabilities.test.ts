import { describe, expect, it } from "vitest";
import { detectCapabilities } from "./capabilities";

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
