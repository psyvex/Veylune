import { describe, expect, it } from "vitest";
import { executeReconstructionWorker } from "./reconstruction-worker";
import { identityCameraPose } from "./keyframe-pose";

function session() {
  const points = [{ id: "l1", x: -1, y: -1, z: 4 }, { id: "l2", x: 1, y: -1, z: 4 }, { id: "l3", x: -1, y: 1, z: 5 }, { id: "l4", x: 1, y: 1, z: 5 }];
  const first = identityCameraPose(); const second = { ...identityCameraPose(), translation: [0.1, 0, 0] as const };
  const observations = points.flatMap((point) => [
    { id: `${point.id}-a`, keyframeId: "k1", landmarkId: point.id, x: 100 * point.x / point.z + 50, y: 100 * point.y / point.z + 50 },
    { id: `${point.id}-b`, keyframeId: "k2", landmarkId: point.id, x: 100 * (point.x + 0.1) / point.z + 50, y: 100 * point.y / point.z + 50 },
  ]);
  return { schemaVersion: 3 as const, createdAtMs: 1, calibration: { intrinsics: { fx: 100, fy: 100, cx: 50, cy: 50 }, distortion: { k1: 0, k2: 0, k3: 0, p1: 0, p2: 0 } }, map: { version: 0, landmarks: points.map((point) => ({ ...point, observations: 2, lastSeenFrame: 1 })), keyframes: [{ id: "k1", frameIndex: 0, timestampMs: 1, landmarkIds: points.map((point) => point.id) }, { id: "k2", frameIndex: 1, timestampMs: 2, landmarkIds: points.map((point) => point.id) }] }, poses: { version: 0, poses: [{ id: "k1", frameIndex: 0, timestampMs: 1, pose: first, fixed: true }, { id: "k2", frameIndex: 1, timestampMs: 2, pose: second, fixed: false }] }, observations };
}

describe("reconstruction worker", () => {
  it("rejects a valid but already optimal map instead of committing a no-op candidate", () => { const input = session(); expect(() => executeReconstructionWorker({ session: input, maxIterations: 2 })).toThrow("Optimization did not produce an improving solution."); });
  it("enforces a bounded iteration budget", () => { expect(() => executeReconstructionWorker({ session: session(), maxIterations: 101 })).toThrow(); });
});
