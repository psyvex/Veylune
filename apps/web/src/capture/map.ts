import type { TriangulatedPoint, CameraPose } from "./triangulation";

export interface Landmark { readonly id: string; readonly x: number; readonly y: number; readonly z: number; readonly observations: number; readonly lastSeenFrame: number; }
export interface Keyframe { readonly id: string; readonly frameIndex: number; readonly timestampMs: number; readonly landmarkIds: readonly string[]; readonly pose?: CameraPose; }
export interface LocalMapSnapshot { readonly version: number; readonly landmarks: readonly Landmark[]; readonly keyframes: readonly Keyframe[]; }

export class LocalMap {
  private readonly landmarks = new Map<string, Landmark>();
  private readonly keyframes = new Map<string, Keyframe>();
  private version = 0;
  addKeyframe(keyframe: Keyframe): void { if (this.keyframes.has(keyframe.id)) throw new Error(`Keyframe ${keyframe.id} already exists.`); if (!validateKeyframe(keyframe)) throw new Error("Invalid keyframe."); this.keyframes.set(keyframe.id, cloneKeyframe(keyframe)); this.version += 1; }
  upsertLandmark(id: string, point: TriangulatedPoint, frameIndex: number): Landmark { const previous = this.landmarks.get(id); const next: Landmark = { id, x: previous ? (previous.x + point.x) / 2 : point.x, y: previous ? (previous.y + point.y) / 2 : point.y, z: previous ? (previous.z + point.z) / 2 : point.z, observations: (previous?.observations ?? 0) + 1, lastSeenFrame: frameIndex }; if (!validateLandmark(next)) throw new Error("Invalid landmark."); this.landmarks.set(id, next); this.version += 1; return next; }
  getLandmark(id: string): Landmark | undefined { return this.landmarks.get(id); }
  getKeyframe(id: string): Keyframe | undefined { return this.keyframes.get(id); }
  landmarkCount(): number { return this.landmarks.size; }
  keyframeCount(): number { return this.keyframes.size; }
  snapshot(): LocalMapSnapshot { return { version: this.version, landmarks: [...this.landmarks.values()], keyframes: [...this.keyframes.values()].map(cloneKeyframe) }; }
  commitSnapshot(expectedVersion: number, snapshot: LocalMapSnapshot): boolean { if (expectedVersion !== this.version || !validateSnapshot(snapshot)) return false; this.landmarks.clear(); this.keyframes.clear(); for (const landmark of snapshot.landmarks) this.landmarks.set(landmark.id, landmark); for (const keyframe of snapshot.keyframes) this.keyframes.set(keyframe.id, cloneKeyframe(keyframe)); this.version += 1; return true; }
  clear(): void { this.landmarks.clear(); this.keyframes.clear(); this.version += 1; }
}

export function validateSnapshot(snapshot: LocalMapSnapshot): boolean {
  if (!Number.isInteger(snapshot.version) || snapshot.version < 0) return false;
  const landmarkIds = new Set<string>();
  for (const landmark of snapshot.landmarks) { if (!validateLandmark(landmark) || landmarkIds.has(landmark.id)) return false; landmarkIds.add(landmark.id); }
  const keyframeIds = new Set<string>();
  for (const keyframe of snapshot.keyframes) { if (!validateKeyframe(keyframe) || keyframeIds.has(keyframe.id)) return false; if (keyframe.landmarkIds.some((id) => !landmarkIds.has(id))) return false; keyframeIds.add(keyframe.id); }
  return true;
}
function validateLandmark(landmark: Landmark): boolean { return Boolean(landmark.id) && [landmark.x, landmark.y, landmark.z, landmark.observations, landmark.lastSeenFrame].every(Number.isFinite) && landmark.z > 0 && landmark.observations >= 0; }
function validateKeyframe(keyframe: Keyframe): boolean { if (!keyframe.id || !Number.isFinite(keyframe.frameIndex) || !Number.isFinite(keyframe.timestampMs)) return false; return !keyframe.pose || [...keyframe.pose.rotation, ...keyframe.pose.translation].every(Number.isFinite); }
function cloneKeyframe(keyframe: Keyframe): Keyframe { return { ...keyframe, landmarkIds: [...keyframe.landmarkIds], pose: keyframe.pose ? { rotation: [...keyframe.pose.rotation] as CameraPose["rotation"], translation: [...keyframe.pose.translation] as CameraPose["translation"] } : undefined }; }
