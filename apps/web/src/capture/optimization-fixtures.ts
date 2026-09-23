import type { Landmark } from "./map";
import type { BundleAdjustmentObservation } from "./bundle-adjustment";

export interface SyntheticFixture {
  readonly landmarks: readonly Landmark[];
  readonly observations: readonly BundleAdjustmentObservation[];
}

export function createSyntheticOptimizationFixture(): SyntheticFixture {
  const landmarks: Landmark[] = [
    { id: "p0", x: -1, y: -1, z: 4, observations: 3, lastSeenFrame: 2 },
    { id: "p1", x: 1, y: -1, z: 4, observations: 3, lastSeenFrame: 2 },
    { id: "p2", x: -1, y: 1, z: 5, observations: 3, lastSeenFrame: 2 },
    { id: "p3", x: 1, y: 1, z: 5, observations: 3, lastSeenFrame: 2 },
  ];
  const observations = landmarks.flatMap((point) => [
    { landmarkId: point.id, cameraId: "c0", observedX: point.x, observedY: point.y },
    { landmarkId: point.id, cameraId: "c1", observedX: point.x + 0.01, observedY: point.y - 0.01 },
  ]);
  return { landmarks, observations };
}
