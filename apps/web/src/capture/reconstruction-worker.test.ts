import { describe, expect, it } from "vitest";
import { executeReconstructionWorker } from "./reconstruction-worker";
import { identityCameraPose } from "./keyframe-pose";

function session() { return { schemaVersion: 3 as const, createdAtMs: 1, calibration: { intrinsics: { fx: 100, fy: 100, cx: 0, cy: 0 }, distortion: { k1: 0, k2: 0, k3: 0, p1: 0, p2: 0 } }, map: { version: 0, landmarks: [{ id: "l1", x: 0, y: 0, z: 2, observations: 2, lastSeenFrame: 1 }], keyframes: [{ id: "k1", frameIndex: 0, timestampMs: 1, landmarkIds: ["l1"] }, { id: "k2", frameIndex: 1, timestampMs: 2, landmarkIds: ["l1"] }] }, poses: { version: 0, poses: [{ id: "k1", frameIndex: 0, timestampMs: 1, pose: identityCameraPose(), fixed: true }, { id: "k2", frameIndex: 1, timestampMs: 2, pose: identityCameraPose(), fixed: false }] }, observations: [{ id: "o1", keyframeId: "k1", landmarkId: "l1", x: 0, y: 0 }, { id: "o2", keyframeId: "k2", landmarkId: "l1", x: 0, y: 0 }] }; }

describe("reconstruction worker", () => {
  it("returns an isolated optimization candidate", () => { const input = session(); const output = executeReconstructionWorker({ session: input, maxIterations: 2 }); expect(output.candidate).not.toBe(input); expect(output.candidate.map.version).toBe(1); expect(output.candidate.poses.version).toBe(1); expect(output.finalCost).toBeLessThanOrEqual(output.initialCost); });
  it("enforces a bounded iteration budget", () => { expect(() => executeReconstructionWorker({ session: session(), maxIterations: 101 })).toThrow(); });
});
