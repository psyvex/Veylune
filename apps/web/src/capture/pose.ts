export interface PoseEstimate {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  readonly pitch: number;
  readonly roll: number;
  readonly confidence: number;
}

export interface ViewpointCoverage {
  readonly samples: readonly PoseEstimate[];
  readonly confidence: number;
}

export type ScanGuidance =
  | "hold_steady"
  | "move_closer"
  | "move_farther"
  | "move_left"
  | "move_right"
  | "move_up"
  | "move_down"
  | "change_viewpoint"
  | "coverage_good"
  | "insufficient_tracking";

export interface PoseEstimator {
  estimate(input: ArrayBuffer): Promise<PoseEstimate | undefined>;
}

export function updateCoverage(
  coverage: ViewpointCoverage,
  pose: PoseEstimate,
): ViewpointCoverage {
  if (pose.confidence < 0.5) return coverage;
  const previous = coverage.samples.at(-1);
  if (previous && distance(previous, pose) < 0.08) return coverage;
  const samples = [...coverage.samples, pose].slice(-128);
  return { samples, confidence: Math.min(1, samples.length / 24) };
}

function distance(a: PoseEstimate, b: PoseEstimate): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

export function getScanGuidance(coverage: ViewpointCoverage): ScanGuidance {
  const latest = coverage.samples.at(-1);
  if (!latest || latest.confidence < 0.5) return "insufficient_tracking";
  if (coverage.confidence >= 0.85) return "coverage_good";
  if (coverage.samples.length < 3) return "change_viewpoint";
  const previous = coverage.samples.at(-2)!;
  if (distance(previous, latest) < 0.12) return "change_viewpoint";
  return "hold_steady";
}
