import type { ReconstructionSessionSnapshot } from "./reconstruction-session";
import type { BundleAdjustmentObservation, BundleAdjustmentProblem } from "./bundle-adjustment";

export interface ReconstructionBundleProblem extends BundleAdjustmentProblem {
  readonly sessionVersion: number;
  readonly mapVersion: number;
  readonly poseVersion: number;
}

export function prepareReconstructionBundle(session: ReconstructionSessionSnapshot): ReconstructionBundleProblem {
  const landmarks = session.map.landmarks;
  const landmarkIds = new Set(landmarks.map((landmark) => landmark.id));
  const cameraIds = new Set(session.poses.poses.map((pose) => pose.id));
  const observations: BundleAdjustmentObservation[] = [];
  for (const observation of session.observations) {
    if (!landmarkIds.has(observation.landmarkId) || !cameraIds.has(observation.keyframeId)) continue;
    observations.push({ landmarkId: observation.landmarkId, cameraId: observation.keyframeId, observedX: observation.x, observedY: observation.y });
  }
  return { landmarks, observations, sessionVersion: session.map.version + session.poses.version, mapVersion: session.map.version, poseVersion: session.poses.version };
}

export function validateBundleInput(problem: ReconstructionBundleProblem): boolean {
  return problem.landmarks.length > 0 && problem.observations.every((observation) => Number.isFinite(observation.observedX) && Number.isFinite(observation.observedY));
}
