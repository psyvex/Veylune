import type { CameraIntrinsics } from "./geometry";
import { hasUsableIntrinsics } from "./geometry";
import type { RadialTangentialDistortion } from "./distortion";
import type { LocalMapSnapshot } from "./map";
import type { PoseGraphSnapshot } from "./keyframe-pose";

export interface ReconstructionObservation { readonly id: string; readonly keyframeId: string; readonly landmarkId: string; readonly x: number; readonly y: number; }
export interface ReconstructionCalibration { readonly intrinsics: CameraIntrinsics; readonly distortion: RadialTangentialDistortion; }
export interface ReconstructionSessionSnapshot { readonly schemaVersion: 3; readonly map: LocalMapSnapshot; readonly poses: PoseGraphSnapshot; readonly observations: readonly ReconstructionObservation[]; readonly calibration: ReconstructionCalibration; readonly createdAtMs: number; }

export function validateReconstructionSession(snapshot: ReconstructionSessionSnapshot): boolean {
  if (snapshot.schemaVersion !== 3 || !Number.isFinite(snapshot.createdAtMs) || !hasUsableIntrinsics(snapshot.calibration.intrinsics)) return false;
  const distortion = snapshot.calibration.distortion;
  if (![distortion.k1, distortion.k2, distortion.k3, distortion.p1, distortion.p2].every(Number.isFinite)) return false;
  if (snapshot.map.landmarks.length === 0 && snapshot.map.keyframes.length > 0) return false;
  const keyframes = new Set(snapshot.map.keyframes.map((keyframe) => keyframe.id));
  const landmarks = new Set(snapshot.map.landmarks.map((landmark) => landmark.id));
  if (snapshot.poses.poses.some((pose) => !keyframes.has(pose.id))) return false;
  const observationIds = new Set<string>();
  return snapshot.observations.every((observation) => {
    if (!observation.id || observationIds.has(observation.id) || !keyframes.has(observation.keyframeId) || !landmarks.has(observation.landmarkId)) return false;
    if (!Number.isFinite(observation.x) || !Number.isFinite(observation.y)) return false;
    observationIds.add(observation.id);
    return true;
  });
}

export function createReconstructionSession(map: LocalMapSnapshot, poses: PoseGraphSnapshot, observations: readonly ReconstructionObservation[] = [], calibration: ReconstructionCalibration = { intrinsics: { fx: 1, fy: 1, cx: 0, cy: 0 }, distortion: { k1: 0, k2: 0, k3: 0, p1: 0, p2: 0 } }, nowMs = Date.now()): ReconstructionSessionSnapshot {
  const snapshot: ReconstructionSessionSnapshot = { schemaVersion: 3, map, poses, observations: [...observations], calibration, createdAtMs: nowMs };
  if (!validateReconstructionSession(snapshot)) throw new Error("Invalid reconstruction session.");
  return snapshot;
}
