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

  return { data: output, shape: [1, 3, height, width] };
}
