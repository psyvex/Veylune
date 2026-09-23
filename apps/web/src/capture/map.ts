import type { TriangulatedPoint } from "./triangulation";

export interface Landmark {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly observations: number;
  readonly lastSeenFrame: number;
}

export interface Keyframe {
  readonly id: string;
  readonly frameIndex: number;
  readonly timestampMs: number;
  readonly landmarkIds: readonly string[];
}

export class LocalMap {
  private readonly landmarks = new Map<string, Landmark>();
  private readonly keyframes = new Map<string, Keyframe>();

  addKeyframe(keyframe: Keyframe): void {
    if (this.keyframes.has(keyframe.id)) throw new Error(`Keyframe ${keyframe.id} already exists.`);
    this.keyframes.set(keyframe.id, keyframe);
  }

  upsertLandmark(id: string, point: TriangulatedPoint, frameIndex: number): Landmark {
    const previous = this.landmarks.get(id);
    const next: Landmark = {
      id,
      x: previous ? (previous.x + point.x) / 2 : point.x,
      y: previous ? (previous.y + point.y) / 2 : point.y,
      z: previous ? (previous.z + point.z) / 2 : point.z,
      observations: (previous?.observations ?? 0) + 1,
      lastSeenFrame: frameIndex,
    };
    this.landmarks.set(id, next);
    return next;
  }

  getLandmark(id: string): Landmark | undefined { return this.landmarks.get(id); }
  getKeyframe(id: string): Keyframe | undefined { return this.keyframes.get(id); }
  landmarkCount(): number { return this.landmarks.size; }
  keyframeCount(): number { return this.keyframes.size; }

  clear(): void {
    this.landmarks.clear();
    this.keyframes.clear();
  }
}
