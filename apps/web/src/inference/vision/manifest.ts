import type { InferenceBackend } from "../model";

export interface VisionModelManifest {
  readonly id: string;
  readonly version: string;
  readonly format: "onnx";
  readonly digest: string;
  readonly license: string;
  readonly supportedBackends: readonly InferenceBackend[];
  readonly input: {
    readonly name: string;
    readonly shape: readonly [1, 3, number, number];
    readonly normalization: "0-1" | "mean-std";
  };
  readonly output: {
    readonly name: string;
    readonly rank: number;
    readonly minValues: number;
    readonly maxValues: number;
  };
}

export function validateVisionManifest(manifest: VisionModelManifest): void {
  if (!manifest.id || !manifest.version || manifest.format !== "onnx") throw new Error("Invalid vision model identity.");
  if (!/^[a-f0-9]{64}$/i.test(manifest.digest)) throw new Error("Vision model digest must be SHA-256.");
  if (!manifest.license) throw new Error("Vision model license is required.");
  if (manifest.supportedBackends.length === 0) throw new Error("Vision model must declare a backend.");
  if (manifest.input.shape[0] !== 1 || manifest.input.shape[1] !== 3) throw new Error("Vision model input must be NCHW RGB.");
  if (manifest.input.shape[2] <= 0 || manifest.input.shape[3] <= 0) throw new Error("Vision model dimensions must be positive.");
  if (manifest.output.rank <= 0 || manifest.output.minValues < 1 || manifest.output.maxValues < manifest.output.minValues) {
    throw new Error("Vision model output bounds are invalid.");
  }
}
