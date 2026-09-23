import { describe, expect, it } from "vitest";
import { createReconstructionSession } from "./reconstruction-session";
import { prepareReconstructionBundle, validateBundleInput } from "./reconstruction-bundle";
import { PoseGraph, identityCameraPose } from "./keyframe-pose";

describe("reconstruction bundle", () => {
  it("maps session observations into BA observations", () => {
    const map = { version: 2, landmarks: [{ id: "lm", x: 0, y: 0, z: 2, observations: 2, lastSeenFrame: 1 }], keyframes: [{ id: "kf", frameIndex: 1, timestampMs: 10, landmarkIds: ["lm"] }] };
    const poses = new PoseGraph();
    poses.add({ id: "kf", frameIndex: 1, timestampMs: 10, pose: identityCameraPose(), fixed: true });
    const session = createReconstructionSession(map, poses.snapshot(), [{ id: "obs", keyframeId: "kf", landmarkId: "lm", x: 12, y: 14 }], 10);
    const problem = prepareReconstructionBundle(session);
    expect(problem.observations).toEqual([{ landmarkId: "lm", cameraId: "kf", observedX: 12, observedY: 14 }]);
    expect(problem.mapVersion).toBe(2);
    expect(validateBundleInput(problem)).toBe(true);
  });

  it("drops observations whose state is no longer present", () => {
    const map = { version: 1, landmarks: [{ id: "lm", x: 0, y: 0, z: 2, observations: 1, lastSeenFrame: 0 }], keyframes: [{ id: "kf", frameIndex: 0, timestampMs: 1, landmarkIds: ["lm"] }] };
    const poses = new PoseGraph();
    poses.add({ id: "kf", frameIndex: 0, timestampMs: 1, pose: identityCameraPose(), fixed: true });
    const session = createReconstructionSession(map, poses.snapshot(), [{ id: "bad", keyframeId: "missing", landmarkId: "lm", x: 1, y: 1 }], 1);
    expect(prepareReconstructionBundle(session).observations).toHaveLength(0);
  });
});
