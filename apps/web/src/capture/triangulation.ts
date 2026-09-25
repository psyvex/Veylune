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

/** Unproject a pixel to a unit ray in world space. */
function unprojectRay(intrinsics: CameraIntrinsics, pose: CameraPose, px: number, py: number): { ox: number; oy: number; oz: number; dx: number; dy: number; dz: number } {
  const { fx, fy, cx, cy } = intrinsics;
  // Normalized image-plane ray in camera space
  const rx = (px - cx) / fx, ry = (py - cy) / fy, rz = 1.0;
  const norm = Math.hypot(rx, ry, rz);
  const nrx = rx / norm, nry = ry / norm, nrz = rz / norm;
  // Rotate to world space: d = R^T * r  (R is world-to-camera, R^T is camera-to-world)
  const R = pose.rotation;
  const dx = R[0]! * nrx + R[3]! * nry + R[6]! * nrz;
  const dy = R[1]! * nrx + R[4]! * nry + R[7]! * nrz;
  const dz = R[2]! * nrx + R[5]! * nry + R[8]! * nrz;
  return { ox: pose.translation[0], oy: pose.translation[1], oz: pose.translation[2], dx, dy, dz };
}

/** Midpoint triangulation — finds the world point closest to both rays. Works for all camera motions. */
function midpointTriangulate(r1: ReturnType<typeof unprojectRay>, r2: ReturnType<typeof unprojectRay>): { x: number; y: number; z: number } | undefined {
  const { ox: o1x, oy: o1y, oz: o1z, dx: d1x, dy: d1y, dz: d1z } = r1;
  const { ox: o2x, oy: o2y, oz: o2z, dx: d2x, dy: d2y, dz: d2z } = r2;
  const d1d2 = d1x * d2x + d1y * d2y + d1z * d2z;
  const denom = 1 - d1d2 * d1d2;
  if (Math.abs(denom) < 1e-8) return undefined; // parallel rays
  const w = [o2x - o1x, o2y - o1y, o2z - o1z];
  const t1 = (w[0]! * d1x + w[1]! * d1y + w[2]! * d1z - d1d2 * (w[0]! * d2x + w[1]! * d2y + w[2]! * d2z)) / denom;
  const t2 = (d1d2 * (w[0]! * d1x + w[1]! * d1y + w[2]! * d1z) - (w[0]! * d2x + w[1]! * d2y + w[2]! * d2z)) / denom;
  if (t1 < 0.01) return undefined; // point must be in front of reference camera
  return {
    x: (o1x + d1x * t1 + o2x + d2x * t2) / 2,
    y: (o1y + d1y * t1 + o2y + d2y * t2) / 2,
    z: (o1z + d1z * t1 + o2z + d2z * t2) / 2,
  };
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

    const r1 = unprojectRay(intrinsics, referencePose, a.x, a.y);
    const r2 = unprojectRay(intrinsics, currentPose, b.x, b.y);
    const pt = midpointTriangulate(r1, r2);
    if (!pt || !Number.isFinite(pt.x) || !Number.isFinite(pt.y) || !Number.isFinite(pt.z)) continue;

    // Reprojection into reference camera for error check
    const R = referencePose.rotation; const C = referencePose.translation;
    const lx = pt.x - C[0], ly = pt.y - C[1], lz = pt.z - C[2];
    const camZ = R[6]! * lx + R[7]! * ly + R[8]! * lz;
    if (camZ <= 0) continue;
    const projX = intrinsics.fx * (R[0]! * lx + R[1]! * ly + R[2]! * lz) / camZ + intrinsics.cx;
    const projY = intrinsics.fy * (R[3]! * lx + R[4]! * ly + R[5]! * lz) / camZ + intrinsics.cy;
    const error = Math.hypot(projX - a.x, projY - a.y);
    if (error <= maxReprojectionErrorPx) {
      points.push({ x: pt.x, y: pt.y, z: pt.z, reprojectionErrorPx: error, match });
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
    accepted: points.length >= 4 && medianReprojectionErrorPx <= maxReprojectionErrorPx,
    medianReprojectionErrorPx,
  };
}
