import { describe, expect, it } from "vitest";
import { createReconstructionSession, validateReconstructionSession } from "./reconstruction-session";
import { PoseGraph, identityCameraPose } from "./keyframe-pose";

const map = {
  version: 0,
  landmarks: [{ id: "lm-1", x: 0, y: 0, z: 2, observations: 1, lastSeenFrame: 0 }],
  keyframes: [{ id: "kf-1", frameIndex: 0, timestampMs: 1, landmarkIds: ["lm-1"] }],
};

describe("reconstruction session", () => {
  it("keeps pose versions separate from map versions", () => {
    const graph = new PoseGraph();
    graph.add({ id: "kf-1", frameIndex: 0, timestampMs: 1, pose: identityCameraPose(), fixed: true });
    const session = createReconstructionSession(map, graph.snapshot(), 10);
    expect(session.map.version).toBe(0);
    expect(session.poses.version).toBe(1);
    expect(validateReconstructionSession(session)).toBe(true);
  });

  it("rejects poses for unknown keyframes", () => {
    const graph = new PoseGraph();
    graph.add({ id: "unknown", frameIndex: 0, timestampMs: 1, pose: identityCameraPose(), fixed: true });
    expect(() => createReconstructionSession(map, graph.snapshot(), 10)).toThrow();
  });

  it("rejects non-finite pose values", () => {
    expect(validateReconstructionSession({
      schemaVersion: 1,
      map,
      poses: { version: 0, poses: [{ id: "kf-1", frameIndex: 0, timestampMs: 1, fixed: true, pose: { rotation: [NaN, 0, 0, 0, 1, 0, 0, 0, 1], translation: [0, 0, 0] } }] },
      createdAtMs: 10,
    })).toBe(false);
  });
});
