import type { LocalMapSnapshot } from "./map";
import type { PoseGraphSnapshot } from "./keyframe-pose";

export interface ReconstructionSessionSnapshot {
  readonly schemaVersion: 1;
  readonly map: LocalMapSnapshot;
  readonly poses: PoseGraphSnapshot;
  readonly createdAtMs: number;
}

export function validateReconstructionSession(snapshot: ReconstructionSessionSnapshot): boolean {
  if (snapshot.schemaVersion !== 1 || !Number.isFinite(snapshot.createdAtMs)) return false;
  if (snapshot.map.landmarks.length === 0 && snapshot.map.keyframes.length > 0) return false;
  if (snapshot.poses.poses.some((pose) => !snapshot.map.keyframes.some((keyframe) => keyframe.id === pose.id))) return false;
  return true;
}

export function createReconstructionSession(map: LocalMapSnapshot, poses: PoseGraphSnapshot, nowMs = Date.now()): ReconstructionSessionSnapshot {
  const snapshot: ReconstructionSessionSnapshot = { schemaVersion: 1, map, poses, createdAtMs: nowMs };
  if (!validateReconstructionSession(snapshot)) throw new Error("Invalid reconstruction session.");
  return snapshot;
}
