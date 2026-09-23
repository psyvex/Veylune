import type { CameraIntrinsics } from "./geometry";

export interface RadialTangentialDistortion {
  readonly k1: number;
  readonly k2: number;
  readonly k3: number;
  readonly p1: number;
  readonly p2: number;
}

export const ZERO_DISTORTION: RadialTangentialDistortion = { k1: 0, k2: 0, k3: 0, p1: 0, p2: 0 };

export function distortNormalizedPoint(
  x: number,
  y: number,
  distortion: RadialTangentialDistortion,
): readonly [number, number] {
  const r2 = x * x + y * y;
  const radial = 1 + distortion.k1 * r2 + distortion.k2 * r2 * r2 + distortion.k3 * r2 * r2 * r2;
  return [
    x * radial + 2 * distortion.p1 * x * y + distortion.p2 * (r2 + 2 * x * x),
    y * radial + distortion.p1 * (r2 + 2 * y * y) + 2 * distortion.p2 * x * y,
  ];
}

export function projectDistortedPoint(
  point: readonly [number, number, number],
  intrinsics: CameraIntrinsics,
  distortion: RadialTangentialDistortion,
): readonly [number, number] | undefined {
  const [x, y, z] = point;
  if (![x, y, z].every(Number.isFinite) || z <= 0) return undefined;
  const normalized = distortNormalizedPoint(x / z, y / z, distortion);
  return [intrinsics.fx * normalized[0] + intrinsics.cx, intrinsics.fy * normalized[1] + intrinsics.cy];
}
