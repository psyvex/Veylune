import type { ReconstructionSessionSnapshot } from "./reconstruction-session";
import { validateReconstructionSession } from "./reconstruction-session";

export interface ReconstructionStateCommit { readonly expectedMapVersion: number; readonly expectedPoseVersion: number; readonly snapshot: ReconstructionSessionSnapshot; }

export class ReconstructionStateStore {
  private snapshotValue: ReconstructionSessionSnapshot;
  constructor(initial: ReconstructionSessionSnapshot) { if (!validateReconstructionSession(initial)) throw new Error("Invalid initial reconstruction state."); this.snapshotValue = cloneSnapshot(initial); }
  snapshot(): ReconstructionSessionSnapshot { return cloneSnapshot(this.snapshotValue); }
  commit(change: ReconstructionStateCommit): boolean {
    if (this.snapshotValue.map.version !== change.expectedMapVersion || this.snapshotValue.poses.version !== change.expectedPoseVersion) return false;
    if (!validateReconstructionSession(change.snapshot)) return false;
    if (change.snapshot.map.version !== change.expectedMapVersion + 1 || change.snapshot.poses.version !== change.expectedPoseVersion + 1) return false;
    this.snapshotValue = cloneSnapshot(change.snapshot);
    return true;
  }
}

function cloneSnapshot(snapshot: ReconstructionSessionSnapshot): ReconstructionSessionSnapshot {
  return {
    schemaVersion: snapshot.schemaVersion,
    createdAtMs: snapshot.createdAtMs,
    map: { version: snapshot.map.version, landmarks: snapshot.map.landmarks.map((landmark) => ({ ...landmark })), keyframes: snapshot.map.keyframes.map((keyframe) => ({ ...keyframe, landmarkIds: [...keyframe.landmarkIds], pose: keyframe.pose ? { rotation: [...keyframe.pose.rotation] as typeof keyframe.pose.rotation, translation: [...keyframe.pose.translation] as typeof keyframe.pose.translation } : undefined })) },
    poses: { version: snapshot.poses.version, poses: snapshot.poses.poses.map((pose) => ({ ...pose, pose: { rotation: [...pose.pose.rotation] as typeof pose.pose.rotation, translation: [...pose.pose.translation] as typeof pose.pose.translation } })) },
    observations: snapshot.observations.map((observation) => ({ ...observation })),
  };
}
