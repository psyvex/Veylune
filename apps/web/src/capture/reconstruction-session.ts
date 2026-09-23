import type { LocalMapSnapshot } from "./map";
import type { PoseGraphSnapshot } from "./keyframe-pose";

export interface ReconstructionObservation { readonly id: string; readonly keyframeId: string; readonly landmarkId: string; readonly x: number; readonly y: number; }
export interface ReconstructionSessionSnapshot { readonly schemaVersion: 2; readonly map: LocalMapSnapshot; readonly poses: PoseGraphSnapshot; readonly observations: readonly ReconstructionObservation[]; readonly createdAtMs: number; }

export function validateReconstructionSession(snapshot: ReconstructionSessionSnapshot): boolean {
  if (snapshot.schemaVersion !== 2 || !Number.isFinite(snapshot.createdAtMs)) return false;
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

export function createReconstructionSession(map: LocalMapSnapshot, poses: PoseGraphSnapshot, observations: readonly ReconstructionObservation[] = [], nowMs = Date.now()): ReconstructionSessionSnapshot {
  const snapshot: ReconstructionSessionSnapshot = { schemaVersion: 2, map, poses, observations: [...observations], createdAtMs: nowMs };
  if (!validateReconstructionSession(snapshot)) throw new Error("Invalid reconstruction session.");
  return snapshot;
}
