import type { CameraIntrinsics } from "./geometry";
import type { CameraPose } from "./triangulation";

export interface ProjectedPoint {
  readonly x: number;
  readonly y: number;
  readonly valid: boolean;
}

export function projectPoint(
  point: readonly [number, number, number],
  intrinsics: CameraIntrinsics,
  pose: CameraPose,
): ProjectedPoint {
  const [x, y, z] = point;
  const r = pose.rotation;
  const t = pose.translation;
  const cameraX = r[0]! * x + r[1]! * y + r[2]! * z + t[0]!;
  const cameraY = r[3]! * x + r[4]! * y + r[5]! * z + t[1]!;
  const cameraZ = r[6]! * x + r[7]! * y + r[8]! * z + t[2]!;
  if (![cameraX, cameraY, cameraZ].every(Number.isFinite) || cameraZ <= 0) {
    return { x: 0, y: 0, valid: false };
  }
  return {
    x: intrinsics.fx * cameraX / cameraZ + intrinsics.cx,
    y: intrinsics.fy * cameraY / cameraZ + intrinsics.cy,
    valid: true,
  };
}

export function reprojectionErrorPx(
  observed: readonly [number, number],
  point: readonly [number, number, number],
  intrinsics: CameraIntrinsics,
  pose: CameraPose,
): number {
  const projected = projectPoint(point, intrinsics, pose);
  if (!projected.valid || !observed.every(Number.isFinite)) return Number.POSITIVE_INFINITY;
  return Math.hypot(projected.x - observed[0]!, projected.y - observed[1]!);
}
