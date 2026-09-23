import type { CameraPose } from "./triangulation";

export interface KeyframePose {
  readonly id: string;
  readonly frameIndex: number;
  readonly timestampMs: number;
  readonly pose: CameraPose;
  readonly fixed: boolean;
}

export interface PoseGraphSnapshot {
  readonly version: number;
  readonly poses: readonly KeyframePose[];
}

export function identityCameraPose(): CameraPose {
  return { rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1], translation: [0, 0, 0] };
}

function clonePose(pose: CameraPose): CameraPose {
  return {
    rotation: [pose.rotation[0]!, pose.rotation[1]!, pose.rotation[2]!, pose.rotation[3]!, pose.rotation[4]!, pose.rotation[5]!, pose.rotation[6]!, pose.rotation[7]!, pose.rotation[8]!],
    translation: [pose.translation[0]!, pose.translation[1]!, pose.translation[2]!],
  };
}

export function validatePoseGraph(snapshot: PoseGraphSnapshot): boolean {
  if (!Number.isInteger(snapshot.version) || snapshot.version < 0) return false;
  const ids = new Set<string>();
  let fixedCount = 0;
  for (const item of snapshot.poses) {
    if (!item.id || ids.has(item.id) || !Number.isFinite(item.frameIndex) || !Number.isFinite(item.timestampMs)) return false;
    if (![...item.pose.rotation, ...item.pose.translation].every(Number.isFinite)) return false;
    if (item.fixed) fixedCount += 1;
    ids.add(item.id);
  }
  return fixedCount <= 1;
}

export class PoseGraph {
  private version = 0;
  private readonly poses = new Map<string, KeyframePose>();

  add(pose: KeyframePose): void {
    if (this.poses.has(pose.id)) throw new Error(`Pose ${pose.id} already exists.`);
    if (pose.fixed && [...this.poses.values()].some((item) => item.fixed)) throw new Error("Only one fixed pose is allowed.");
    this.poses.set(pose.id, { ...pose, pose: clonePose(pose.pose) });
    this.version += 1;
  }

  get(id: string): KeyframePose | undefined {
    const pose = this.poses.get(id);
    return pose ? { ...pose, pose: clonePose(pose.pose) } : undefined;
  }

  snapshot(): PoseGraphSnapshot {
    return { version: this.version, poses: [...this.poses.values()].map((item) => ({ ...item, pose: clonePose(item.pose) })) };
  }

  commit(expectedVersion: number, snapshot: PoseGraphSnapshot): boolean {
    if (expectedVersion !== this.version || !validatePoseGraph(snapshot)) return false;
    this.poses.clear();
    for (const item of snapshot.poses) this.poses.set(item.id, { ...item, pose: clonePose(item.pose) });
    this.version += 1;
    return true;
  }
}
