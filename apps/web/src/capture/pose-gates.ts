import type { PoseEstimationResult } from "./pose-estimation";

export interface PoseGateOptions {
  readonly minimumConfidence: number;
  readonly minimumInliers: number;
  readonly minimumParallaxPx: number;
}

export function shouldAcceptPose(
  result: PoseEstimationResult,
  parallaxPx: number,
  options: PoseGateOptions = { minimumConfidence: 0.6, minimumInliers: 12, minimumParallaxPx: 1.5 },
): boolean {
  return result.status === "accepted"
    && result.pose !== undefined
    && result.inliers.length >= options.minimumInliers
    && result.confidence >= options.minimumConfidence
    && Number.isFinite(parallaxPx)
    && parallaxPx >= options.minimumParallaxPx;
}

export function computeMedianParallax(
  deltas: readonly { readonly dx: number; readonly dy: number }[],
): number {
  if (deltas.length === 0) return 0;
  const values = deltas.map(({ dx, dy }) => Math.hypot(dx, dy)).filter(Number.isFinite).sort((a, b) => a - b);
  if (values.length === 0) return 0;
  const middle = Math.floor(values.length / 2);
  return values.length % 2 === 0 ? (values[middle - 1]! + values[middle]!) / 2 : values[middle]!;
}
