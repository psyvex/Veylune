import type { CameraIntrinsics } from "./geometry";

export interface RadialTangentialDistortion {
  readonly k1: number;
  readonly k2: number;
  readonly k3: number;
  readonly p1: number;
  readonly p2: number;
}

export const ZERO_DISTORTION: RadialTangentialDistortion = { k1: 0, k2: 0, k3: 0, p1: 0, p2: 0 };

export interface DistortedPointWithJacobian { readonly point: readonly [number, number]; readonly jacobian: readonly [number, number, number, number]; }

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

export function distortNormalizedPointWithJacobian(x: number, y: number, distortion: RadialTangentialDistortion): DistortedPointWithJacobian {
  const r2 = x * x + y * y;
  const r4 = r2 * r2;
  const radial = 1 + distortion.k1 * r2 + distortion.k2 * r4 + distortion.k3 * r4 * r2;
  const radialSlope = distortion.k1 + 2 * distortion.k2 * r2 + 3 * distortion.k3 * r4;
  const radialX = 2 * x * radialSlope;
  const radialY = 2 * y * radialSlope;
  const point: readonly [number, number] = [
    x * radial + 2 * distortion.p1 * x * y + distortion.p2 * (r2 + 2 * x * x),
    y * radial + distortion.p1 * (r2 + 2 * y * y) + 2 * distortion.p2 * x * y,
  ];
  const jacobian: readonly [number, number, number, number] = [
    radial + x * radialX + 2 * distortion.p1 * y + 6 * distortion.p2 * x,
    x * radialY + 2 * distortion.p1 * x + 2 * distortion.p2 * y,
    y * radialX + 2 * distortion.p1 * x + 2 * distortion.p2 * y,
    radial + y * radialY + 6 * distortion.p1 * y + 2 * distortion.p2 * x,
  ];
  return { point, jacobian };
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

export function projectDistortedPointWithJacobian(
  point: readonly [number, number, number],
  intrinsics: CameraIntrinsics,
  distortion: RadialTangentialDistortion,
): { readonly pixel: readonly [number, number]; readonly jacobian: Float64Array } | undefined {
  const [x, y, z] = point;
  if (![x, y, z].every(Number.isFinite) || z <= 0) return undefined;
  const nx = x / z; const ny = y / z;
  const distorted = distortNormalizedPointWithJacobian(nx, ny, distortion);
  const j = distorted.jacobian;
  const jxX = j[0] / z; const jxY = j[1] / z;
  const jyX = j[2] / z; const jyY = j[3] / z;
  const jxZ = -(jxX * x + jxY * y) / z;
  const jyZ = -(jyX * x + jyY * y) / z;
  const jacobian = new Float64Array([
    intrinsics.fx * jxX, intrinsics.fx * jxY, intrinsics.fx * jxZ,
    intrinsics.fy * jyX, intrinsics.fy * jyY, intrinsics.fy * jyZ,
  ]);
  if (![...distorted.point, ...jacobian].every(Number.isFinite)) return undefined;
  return { pixel: [intrinsics.fx * distorted.point[0] + intrinsics.cx, intrinsics.fy * distorted.point[1] + intrinsics.cy], jacobian };
}
