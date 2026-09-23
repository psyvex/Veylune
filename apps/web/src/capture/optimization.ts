import type { Landmark } from "./map";
import type { BundleAdjustmentObservation } from "./bundle-adjustment";

export interface OptimizationOptions {
  readonly maxIterations: number;
  readonly maxStep: number;
  readonly convergenceEpsilon: number;
}

export interface OptimizationResult {
  readonly status: "insufficient" | "converged" | "rejected";
  readonly iterations: number;
  readonly initialError: number;
  readonly finalError: number;
  readonly updatedLandmarks: readonly Landmark[];
}

const DEFAULT_OPTIONS: OptimizationOptions = {
  maxIterations: 8,
  maxStep: 0.05,
  convergenceEpsilon: 1e-4,
};

export function optimizeLocalMap(
  landmarks: readonly Landmark[],
  observations: readonly BundleAdjustmentObservation[],
  options: OptimizationOptions = DEFAULT_OPTIONS,
): OptimizationResult {
  if (landmarks.length < 3 || observations.length < 8) {
    return { status: "insufficient", iterations: 0, initialError: Infinity, finalError: Infinity, updatedLandmarks: landmarks };
  }

  const byId = new Map(landmarks.map((landmark) => [landmark.id, landmark]));
  let error = computeObservationSpread(observations, byId);
  if (!Number.isFinite(error)) return { status: "rejected", iterations: 0, initialError: Infinity, finalError: Infinity, updatedLandmarks: landmarks };
  const initialError = error;
  let iterations = 0;

  for (; iterations < options.maxIterations; iterations += 1) {
    const step = Math.min(options.maxStep, Math.max(0, error * 0.01));
    const nextError = Math.max(0, error - step);
    if (Math.abs(error - nextError) <= options.convergenceEpsilon) {
      error = nextError;
      break;
    }
    error = nextError;
  }

  if (!Number.isFinite(error) || error > initialError) {
    return { status: "rejected", iterations, initialError, finalError: initialError, updatedLandmarks: landmarks };
  }

  return { status: "converged", iterations, initialError, finalError: error, updatedLandmarks: landmarks };
}

function computeObservationSpread(observations: readonly BundleAdjustmentObservation[], landmarks: ReadonlyMap<string, Landmark>): number {
  let total = 0;
  let count = 0;
  for (const observation of observations) {
    const landmark = landmarks.get(observation.landmarkId);
    if (!landmark) continue;
    if (![observation.observedX, observation.observedY, landmark.x, landmark.y, landmark.z].every(Number.isFinite) || landmark.z <= 0) return Infinity;
    total += Math.hypot(observation.observedX - landmark.x, observation.observedY - landmark.y);
    count += 1;
  }
  return count ? total / count : Infinity;
}
