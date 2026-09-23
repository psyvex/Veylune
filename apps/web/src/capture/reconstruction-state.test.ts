import { describe, expect, it } from "vitest";
import { PoseGraph, identityCameraPose } from "./keyframe-pose";
import { createReconstructionSession } from "./reconstruction-session";
import { ReconstructionStateStore } from "./reconstruction-state";

function session() {
  const map = { version: 1, landmarks: [{ id: "lm", x: 0, y: 0, z: 2, observations: 1, lastSeenFrame: 0 }], keyframes: [{ id: "kf", frameIndex: 0, timestampMs: 1, landmarkIds: ["lm"] }] };
  const poses = new PoseGraph();
  poses.add({ id: "kf", frameIndex: 0, timestampMs: 1, pose: identityCameraPose(), fixed: true });
  return createReconstructionSession(map, poses.snapshot(), [{ id: "obs", keyframeId: "kf", landmarkId: "lm", x: 10, y: 10 }], 1);
}

describe("reconstruction state store", () => {
  it("commits map and pose state as one validated snapshot", () => {
    const store = new ReconstructionStateStore(session());
    const current = store.snapshot();
    const candidate = { ...current, map: { ...current.map, version: current.map.version + 1 }, poses: { ...current.poses, version: current.poses.version + 1 }, createdAtMs: 2 };
    expect(store.commit({ expectedMapVersion: current.map.version, expectedPoseVersion: current.poses.version, snapshot: candidate })).toBe(true);
    expect(store.snapshot().createdAtMs).toBe(2);
  });

  it("rejects stale commits without mutating state", () => {
    const store = new ReconstructionStateStore(session());
    const current = store.snapshot();
    expect(store.commit({ expectedMapVersion: current.map.version - 1, expectedPoseVersion: current.poses.version, snapshot: current })).toBe(false);
    expect(store.snapshot().createdAtMs).toBe(1);
  });

  it("rejects invalid candidates before mutation", () => {
    const store = new ReconstructionStateStore(session());
    const current = store.snapshot();
    const invalid = { ...current, map: { ...current.map, version: current.map.version + 1 }, poses: { ...current.poses, version: current.poses.version + 1 }, observations: [{ id: "bad", keyframeId: "missing", landmarkId: "lm", x: 0, y: 0 }] };
    expect(store.commit({ expectedMapVersion: current.map.version, expectedPoseVersion: current.poses.version, snapshot: invalid })).toBe(false);
    expect(store.snapshot().observations[0]?.id).toBe("obs");
  });
});
