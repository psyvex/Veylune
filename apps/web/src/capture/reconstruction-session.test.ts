import { describe, expect, it } from "vitest";
import { createReconstructionSession, validateReconstructionSession } from "./reconstruction-session";
import { PoseGraph, identityCameraPose } from "./keyframe-pose";

const map = {
  version: 0,
  landmarks: [{ id: "lm-1", x: 0, y: 0, z: 2, observations: 1, lastSeenFrame: 0 }],
  keyframes: [{ id: "kf-1", frameIndex: 0, timestampMs: 1, landmarkIds: ["lm-1"] }],
};

describe("reconstruction session", () => {
  it("keeps observations attached to existing state", () => {
    const graph = new PoseGraph();
    graph.add({ id: "kf-1", frameIndex: 0, timestampMs: 1, pose: identityCameraPose(), fixed: true });
    const session = createReconstructionSession(map, graph.snapshot(), [{ id: "obs-1", keyframeId: "kf-1", landmarkId: "lm-1", x: 10, y: 20 }], undefined, 10);
    expect(session.observations).toHaveLength(1);
    expect(validateReconstructionSession(session)).toBe(true);
  });

  it("rejects dangling observation references", () => {
    const graph = new PoseGraph();
    graph.add({ id: "kf-1", frameIndex: 0, timestampMs: 1, pose: identityCameraPose(), fixed: true });
    const session = createReconstructionSession(map, graph.snapshot(), [], undefined, 10);
    expect(validateReconstructionSession({ ...session, observations: [{ id: "bad", keyframeId: "missing", landmarkId: "lm-1", x: 0, y: 0 }] })).toBe(false);
  });

  it("rejects poses for unknown keyframes", () => {
    const graph = new PoseGraph();
    graph.add({ id: "unknown", frameIndex: 0, timestampMs: 1, pose: identityCameraPose(), fixed: true });
    expect(() => createReconstructionSession(map, graph.snapshot(), [], undefined, 10)).toThrow();
  });
});
