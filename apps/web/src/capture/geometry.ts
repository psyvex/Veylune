import type { Keypoint, FeatureMatch } from "./features";

export interface GeometryResult {
  readonly inliers: readonly FeatureMatch[];
  readonly inlierRatio: number;
  readonly model: "homography" | "essential" | "insufficient";
  readonly confidence: number;
}

export interface CameraIntrinsics {
  readonly fx: number;
  readonly fy: number;
  readonly cx: number;
  readonly cy: number;
}

export function verifyMatches(
  reference: readonly Keypoint[],
  current: readonly Keypoint[],
  matches: readonly FeatureMatch[],
  thresholdPx = 3,
): GeometryResult {
  if (matches.length < 4) return { inliers: [], inlierRatio: 0, model: "insufficient", confidence: 0 };

  const valid = matches.filter((match) => {
    const a = reference[match.referenceIndex];
    const b = current[match.currentIndex];
    return !!a && !!b && Number.isFinite(a.x) && Number.isFinite(a.y) && Number.isFinite(b.x) && Number.isFinite(b.y);
  });

  if (valid.length < 4) return { inliers: [], inlierRatio: 0, model: "insufficient", confidence: 0 };

  const medianDx = median(valid.map((m) => current[m.currentIndex]!.x - reference[m.referenceIndex]!.x));
  const medianDy = median(valid.map((m) => current[m.currentIndex]!.y - reference[m.referenceIndex]!.y));
  const inliers = valid.filter((m) => {
    const dx = current[m.currentIndex]!.x - reference[m.referenceIndex]!.x;
    const dy = current[m.currentIndex]!.y - reference[m.referenceIndex]!.y;
    return Math.hypot(dx - medianDx, dy - medianDy) <= thresholdPx;
  });
  const ratio = inliers.length / valid.length;
  const model = valid.length >= 8 && ratio >= 0.5 ? "homography" : "insufficient";
  return { inliers, inlierRatio: ratio, model, confidence: Math.min(1, ratio * Math.min(1, inliers.length / 20)) };
}

export function hasUsableIntrinsics(intrinsics: CameraIntrinsics): boolean {
  return [intrinsics.fx, intrinsics.fy, intrinsics.cx, intrinsics.cy].every(Number.isFinite) && intrinsics.fx > 0 && intrinsics.fy > 0;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1]! + sorted[middle]!) / 2 : sorted[middle]!;
}
