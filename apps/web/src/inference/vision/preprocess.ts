import type { TensorInput } from "../engine";

export interface VisionPreprocessOptions {
  readonly width: number;
  readonly height: number;
  readonly mean?: readonly [number, number, number];
  readonly std?: readonly [number, number, number];
}

export function rgbaToNchwTensor(
  rgba: Uint8Array,
  options: VisionPreprocessOptions,
): TensorInput {
  const { width, height } = options;
  if (rgba.byteLength !== width * height * 4) {
    throw new Error("RGBA frame size does not match preprocessing dimensions.");
  }

  const mean = options.mean ?? [0, 0, 0];
  const std = options.std ?? [1, 1, 1];
  const planeSize = width * height;
  const output = new Float32Array(planeSize * 3);

  for (let i = 0; i < planeSize; i += 1) {
    const source = i * 4;
    const r = rgba[source]! / 255;
    const g = rgba[source + 1]! / 255;
    const b = rgba[source + 2]! / 255;
    output[i] = (r - mean[0]!) / std[0]!;
    output[planeSize + i] = (g - mean[1]!) / std[1]!;
    output[planeSize * 2 + i] = (b - mean[2]!) / std[2]!;
  }

  return { data: output, shape: [1, 3, height, width], dtype: "float32" };
}

/**
 * NHWC, unnormalized integer preprocessing — for a model whose own graph
 * does input scaling (e.g. MoveNet's `int32 [1, H, W, 3]`, 0-255 range; see
 * `models/movenet-singlepose-lightning/model-card.md`). Added alongside
 * `rgbaToNchwTensor` rather than folding into it, since the two produce
 * genuinely different tensor shapes/dtypes for a caller that already knows
 * which layout its model needs (from `VisionModelManifest.input.layout`).
 */
export function rgbaToNhwcTensor(
  rgba: Uint8Array,
  options: { readonly width: number; readonly height: number; readonly dtype?: "int32" | "uint8" },
): TensorInput {
  const { width, height } = options;
  if (rgba.byteLength !== width * height * 4) {
    throw new Error("RGBA frame size does not match preprocessing dimensions.");
  }
  const dtype = options.dtype ?? "int32";
  const pixelCount = width * height;
  const output = dtype === "int32" ? new Int32Array(pixelCount * 3) : new Uint8Array(pixelCount * 3);
  for (let i = 0; i < pixelCount; i += 1) {
    const source = i * 4;
    const dest = i * 3;
    output[dest] = rgba[source]!;
    output[dest + 1] = rgba[source + 1]!;
    output[dest + 2] = rgba[source + 2]!;
  }
  return { data: output, shape: [1, height, width, 3], dtype };
}
