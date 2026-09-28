import { describe, expect, it } from "vitest";
import { validateVisionManifest, type VisionModelManifest } from "./manifest";

const base = (overrides: Partial<VisionModelManifest["input"]> = {}): VisionModelManifest => ({
  id: "test-model",
  version: "1",
  format: "onnx",
  digest: "a".repeat(64),
  license: "Apache-2.0",
  supportedBackends: ["wasm"],
  input: { name: "input", layout: "nchw", shape: [1, 3, 224, 224], dtype: "float32", normalization: "0-1", ...overrides },
  output: { name: "output", rank: 2, minValues: 1, maxValues: 1000 },
});

describe("validateVisionManifest", () => {
  it("accepts a valid NCHW manifest", () => {
    expect(() => validateVisionManifest(base())).not.toThrow();
  });

  it("accepts a valid NHWC manifest (e.g. MoveNet's real shape)", () => {
    const manifest = base({ layout: "nhwc", shape: [1, 192, 192, 3], dtype: "int32", normalization: "none" });
    expect(() => validateVisionManifest(manifest)).not.toThrow();
  });

  it("rejects an NCHW manifest whose channel dimension isn't 3", () => {
    const manifest = base({ shape: [1, 4, 224, 224] });
    expect(() => validateVisionManifest(manifest)).toThrow(/RGB/);
  });

  it("rejects an NHWC manifest whose channel dimension isn't 3", () => {
    const manifest = base({ layout: "nhwc", shape: [1, 224, 224, 4] });
    expect(() => validateVisionManifest(manifest)).toThrow(/RGB/);
  });

  it("rejects a non-unit batch size", () => {
    const manifest = { ...base(), input: { ...base().input, shape: [2, 3, 224, 224] as const } };
    expect(() => validateVisionManifest(manifest)).toThrow(/batch size/);
  });
});
