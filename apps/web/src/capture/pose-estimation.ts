import type { CameraIntrinsics, GeometryResult } from "./geometry";
import type { Keypoint, FeatureMatch } from "./features";

export interface RelativePose {
  readonly rotation: readonly [number, number, number, number, number, number, number, number, number];
  readonly translationDirection: readonly [number, number, number];
  readonly scaleKnown: false;
  readonly confidence: number;
}

export interface PoseEstimationResult {
  readonly pose?: RelativePose;
  readonly inliers: readonly FeatureMatch[];
  readonly status: "insufficient" | "degenerate" | "accepted";
  readonly confidence: number;
}

export function estimateRelativePose(
  reference: readonly Keypoint[],
  current: readonly Keypoint[],
  matches: readonly FeatureMatch[],
  geometry: GeometryResult,
  intrinsics: CameraIntrinsics,
): PoseEstimationResult {
  if (!Number.isFinite(intrinsics.fx) || !Number.isFinite(intrinsics.fy) || intrinsics.fx <= 0 || intrinsics.fy <= 0) {
    return { inliers: [], status: "insufficient", confidence: 0 };
  }
  if (geometry.model !== "essential" || geometry.inliers.length < 8) {
    return { inliers: geometry.inliers, status: geometry.model === "homography" ? "degenerate" : "insufficient", confidence: geometry.confidence };
  }

  const dx = median(geometry.inliers.map((m) => current[m.currentIndex]!.x - reference[m.referenceIndex]!.x));
  const dy = median(geometry.inliers.map((m) => current[m.currentIndex]!.y - reference[m.referenceIndex]!.y));
  const magnitude = Math.hypot(dx, dy);
  if (!Number.isFinite(magnitude) || magnitude < 0.25) {
    return { inliers: geometry.inliers, status: "degenerate", confidence: geometry.confidence * 0.5 };
  }

  const nx = dx / magnitude;
  const ny = dy / magnitude;
  return {
    pose: {
      rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      translationDirection: [nx, ny, 0],
      scaleKnown: false,
      confidence: geometry.confidence,
    },
    inliers: geometry.inliers,
    status: "accepted",
    confidence: geometry.confidence,
  };
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1]! + sorted[middle]!) / 2 : sorted[middle]!;
}
