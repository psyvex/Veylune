import type { Landmark } from "./map";

export interface BundleAdjustmentObservation {
  readonly landmarkId: string;
  readonly cameraId: string;
  readonly observedX: number;
  readonly observedY: number;
}

export interface BundleAdjustmentProblem {
  readonly landmarks: readonly Landmark[];
  readonly observations: readonly BundleAdjustmentObservation[];
}

export interface BundleAdjustmentResult {
  readonly status: "not-run" | "insufficient";
  readonly iterations: number;
  readonly observationCount: number;
}

export function prepareBundleAdjustment(problem: BundleAdjustmentProblem): BundleAdjustmentResult {
  if (problem.landmarks.length < 3 || problem.observations.length < 8) {
    return { status: "insufficient", iterations: 0, observationCount: problem.observations.length };
  }
  return { status: "not-run", iterations: 0, observationCount: problem.observations.length };
}
