import { describe, expect, it } from "vitest";
import { triangulateCorrespondences, type CameraPose } from "./triangulation";
import type { CameraIntrinsics } from "./geometry";

// Pose convention: world-to-camera, X_cam = R (X_world - C); translation is
// the camera center. These fixtures project a known 3D grid into two views and
// feed the resulting correspondences back to the triangulator.

const intrinsics: CameraIntrinsics = { fx: 500, fy: 500, cx: 256, cy: 256 };
const identity: CameraPose["rotation"] = [1, 0, 0, 0, 1, 0, 0, 0, 1];

const pose1: CameraPose = { rotation: identity, translation: [0, 0, 0] };
const pose2: CameraPose = { rotation: identity, translation: [0.2, 0, 0] };

function project(pose: CameraPose, point: [number, number, number]): { x: number; y: number } {
  const lx = point[0] - pose.translation[0];
  const ly = point[1] - pose.translation[1];
  const lz = point[2] - pose.translation[2];
  const R = pose.rotation;
  const px = R[0]! * lx + R[1]! * ly + R[2]! * lz;
  const py = R[3]! * lx + R[4]! * ly + R[5]! * lz;
  const pz = R[6]! * lx + R[7]! * ly + R[8]! * lz;
  return { x: intrinsics.fx * (px / pz) + intrinsics.cx, y: intrinsics.fy * (py / pz) + intrinsics.cy };
}

const world: [number, number, number][] = [
  [-0.3, -0.2, 2.5], [0.3, -0.2, 2.5], [-0.3, 0.2, 2.5], [0.3, 0.2, 2.5],
  [-0.4, -0.3, 3.5], [0.4, -0.3, 3.5], [-0.4, 0.3, 3.5], [0.4, 0.3, 3.5],
];

describe("triangulateCorrespondences", () => {
  it("recovers the known 3D points from exact correspondences", () => {
    const reference = world.map((p) => ({ ...project(pose1, p), score: 1 }));
    const current = world.map((p) => ({ ...project(pose2, p), score: 1 }));
    const matches = world.map((_, index) => ({ referenceIndex: index, currentIndex: index, distance: 0 }));
    const result = triangulateCorrespondences(reference, current, matches, intrinsics, pose1, pose2, 2);
    expect(result.accepted).toBe(true);
    expect(result.points).toHaveLength(world.length);
    expect(result.medianReprojectionErrorPx).toBeLessThan(0.01);
    for (let i = 0; i < world.length; i++) {
      const point = result.points[i]!;
      expect(point.x).toBeCloseTo(world[i]![0], 3);
      expect(point.y).toBeCloseTo(world[i]![1], 3);
      expect(point.z).toBeCloseTo(world[i]![2], 3);
    }
  });

  it("rejects an empty correspondence set", () => {
    const result = triangulateCorrespondences([], [], [], intrinsics, pose1, pose2);
    expect(result.accepted).toBe(false);
    expect(result.points).toHaveLength(0);
    expect(result.medianReprojectionErrorPx).toBe(Number.POSITIVE_INFINITY);
  });

  it("needs at least four accepted points to report success", () => {
    const three = world.slice(0, 3);
    const reference = three.map((p) => ({ ...project(pose1, p), score: 1 }));
    const current = three.map((p) => ({ ...project(pose2, p), score: 1 }));
    const matches = three.map((_, index) => ({ referenceIndex: index, currentIndex: index, distance: 0 }));
    const result = triangulateCorrespondences(reference, current, matches, intrinsics, pose1, pose2, 2);
    expect(result.points).toHaveLength(3);
    expect(result.accepted).toBe(false);
  });

  it("drops points that fall behind the second camera", () => {
    // Correspondences "projected" through a rear-facing second camera are
    // nonsense: the recovered point sits in front of camera 1 (and even
    // reprojects perfectly there), but along camera 2's ray it lies at a
    // NEGATIVE distance. Only a t2 gate catches this class.
    const poseBack: CameraPose = { rotation: [-1, 0, 0, 0, 1, 0, 0, 0, -1], translation: [0.2, 0, 0] };
    const reference = world.map((p) => ({ ...project(pose1, p), score: 1 }));
    const current = world.map((p) => ({ ...project(poseBack, p), score: 1 }));
    const matches = world.map((_, index) => ({ referenceIndex: index, currentIndex: index, distance: 0 }));
    const result = triangulateCorrespondences(reference, current, matches, intrinsics, pose1, poseBack, 2);
    expect(result.points).toHaveLength(0);
    expect(result.accepted).toBe(false);
  });

  it("drops points that fall behind the reference camera", () => {
    // A bogus correspondence whose epipolar partner points backwards must not
    // produce a vertex in front of the camera.
    const reference = world.map((p) => ({ ...project(pose1, p), score: 1 }));
    const current = world.map(() => ({ x: 10, y: 10, score: 1 })); // nonsense — rays aim away
    const matches = world.map((_, index) => ({ referenceIndex: index, currentIndex: index, distance: 0 }));
    const result = triangulateCorrespondences(reference, current, matches, intrinsics, pose1, pose2, 2);
    for (const point of result.points) {
      const camZ = point.z - pose1.translation[2];
      expect(camZ).toBeGreaterThan(0);
    }
  });
});
