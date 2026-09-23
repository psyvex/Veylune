import type { CameraIntrinsics } from "./geometry";
import type { Keypoint, FeatureMatch } from "./features";

export interface CameraPose {
  readonly rotation: readonly [number, number, number, number, number, number, number, number, number];
  readonly translation: readonly [number, number, number];
}

export interface TriangulatedPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly reprojectionErrorPx: number;
  readonly match: FeatureMatch;
}

export interface TriangulationResult {
  readonly points: readonly TriangulatedPoint[];
  readonly accepted: boolean;
  readonly medianReprojectionErrorPx: number;
}

export function triangulateCorrespondences(
  reference: readonly Keypoint[],
  current: readonly Keypoint[],
  matches: readonly FeatureMatch[],
  intrinsics: CameraIntrinsics,
  referencePose: CameraPose,
  currentPose: CameraPose,
  maxReprojectionErrorPx = 2,
): TriangulationResult {
  if (matches.length === 0 || intrinsics.fx <= 0 || intrinsics.fy <= 0) {
    return { points: [], accepted: false, medianReprojectionErrorPx: Number.POSITIVE_INFINITY };
  }

  const points: TriangulatedPoint[] = [];
  for (const match of matches) {
    const a = reference[match.referenceIndex];
    const b = current[match.currentIndex];
    if (!a || !b) continue;

    const disparity = a.x - b.x;
    if (!Number.isFinite(disparity) || Math.abs(disparity) < 0.5) continue;

    const baseline = Math.hypot(
      currentPose.translation[0] - referencePose.translation[0],
      currentPose.translation[1] - referencePose.translation[1],
      currentPose.translation[2] - referencePose.translation[2],
    );
    if (!Number.isFinite(baseline) || baseline <= 0) continue;

    const z = Math.abs((intrinsics.fx * baseline) / disparity);
    const x = ((a.x - intrinsics.cx) * z) / intrinsics.fx;
    const y = ((a.y - intrinsics.cy) * z) / intrinsics.fy;
    if (![x, y, z].every(Number.isFinite) || z <= 0) continue;

    const projectedX = (x * intrinsics.fx) / z + intrinsics.cx;
    const projectedY = (y * intrinsics.fy) / z + intrinsics.cy;
    const error = Math.hypot(projectedX - a.x, projectedY - a.y);
    if (error <= maxReprojectionErrorPx) {
      points.push({ x, y, z, reprojectionErrorPx: error, match });
    }
  }

  const errors = points.map((point) => point.reprojectionErrorPx).sort((a, b) => a - b);
  const medianReprojectionErrorPx = errors.length === 0
    ? Number.POSITIVE_INFINITY
    : errors.length % 2 === 0
      ? (errors[errors.length / 2 - 1]! + errors[errors.length / 2]!) / 2
      : errors[Math.floor(errors.length / 2)]!;

  return {
    points,
    accepted: points.length >= 8 && medianReprojectionErrorPx <= maxReprojectionErrorPx,
    medianReprojectionErrorPx,
  };
}
