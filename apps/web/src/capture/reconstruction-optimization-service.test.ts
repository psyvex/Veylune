import { describe, expect, it } from "vitest";
import { identityCameraPose, PoseGraph } from "./keyframe-pose";
import { createReconstructionSession } from "./reconstruction-session";
import { ReconstructionStateStore } from "./reconstruction-state";
import { optimizeAndCommitReconstruction } from "./reconstruction-optimization-service";

function emptySession() {
  const map = { version: 0, landmarks: [], keyframes: [] };
  const poses = new PoseGraph();
  return createReconstructionSession(map, poses.snapshot(), [], undefined, 1);
}

describe("reconstruction optimization service", () => {
  it("fails closed when there is not enough reconstruction data", () => {
    const store = new ReconstructionStateStore(emptySession());
    const result = optimizeAndCommitReconstruction(store);
    expect(result.status).toBe("insufficient");
    expect(store.snapshot().map.version).toBe(0);
    expect(store.snapshot().poses.version).toBe(0);
  });

  it("keeps a fixed reference pose immutable at the session boundary", () => {
    const poses = new PoseGraph();
    poses.add({ id: "kf", frameIndex: 0, timestampMs: 1, pose: identityCameraPose(), fixed: true });
    const map = { version: 0, landmarks: [{ id: "lm", x: 0, y: 0, z: 2, observations: 1, lastSeenFrame: 0 }], keyframes: [{ id: "kf", frameIndex: 0, timestampMs: 1, landmarkIds: ["lm"] }] };
    const session = createReconstructionSession(map, poses.snapshot(), [{ id: "obs", keyframeId: "kf", landmarkId: "lm", x: 0, y: 0 }]);
    expect(session.poses.poses[0]?.fixed).toBe(true);
  });
});
