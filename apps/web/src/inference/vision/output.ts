import type { TensorOutput } from "../engine";

export interface VisionOutputSpec {
  readonly rank: number;
  readonly minValues: number;
  readonly maxValues: number;
}

export function validateVisionOutput(output: TensorOutput, spec: VisionOutputSpec): void {
  if (output.shape.length !== spec.rank) throw new Error("Vision model output rank is invalid.");
  if (output.data.length < spec.minValues || output.data.length > spec.maxValues) {
    throw new Error("Vision model output size is outside the declared bounds.");
  }
  for (const value of output.data) {
    if (!Number.isFinite(value)) throw new Error("Vision model produced a non-finite output.");
  }
}
