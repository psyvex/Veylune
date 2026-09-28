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
  // pose.translation is the camera's world-space CENTER, not a
  // world-to-camera translation — matching triangulation.ts's
  // unprojectRay, essential-matrix.ts's C1/C2, and how
  // local-pose-estimator.ts actually builds every real pose
  // (composePose accumulates world-center deltas). This function
  // previously computed R*X + translation (treating translation as a
  // standard w2c `t`), which silently fed the wrong geometric model into
  // every reprojection error / Jacobian downstream — see ADR-013 Stage 1
  // task 13's notes and docs/07-architecture-decisions.md for the writeup.
  const [x, y, z] = point;
  const r = pose.rotation;
  const c = pose.translation;
  const lx = x - c[0]!, ly = y - c[1]!, lz = z - c[2]!;
  const cameraX = r[0]! * lx + r[1]! * ly + r[2]! * lz;
  const cameraY = r[3]! * lx + r[4]! * ly + r[5]! * lz;
  const cameraZ = r[6]! * lx + r[7]! * ly + r[8]! * lz;
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
