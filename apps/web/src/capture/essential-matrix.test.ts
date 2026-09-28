import { afterEach, describe, expect, it, vi } from "vitest";

// RANSAC sampling is random; seed it so a rare unlucky sample sequence never
// flakes CI.
function seedRandom(seed: number): void {
  let s = seed;
  vi.spyOn(Math, "random").mockImplementation(() => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  });
}
afterEach(() => vi.restoreAllMocks());
import {
  decomposeEssentialMatrix,
  epipolarInlierMask,
  essentialFromPoses,
  estimateEssentialMatrix,
  robustEstimateEssentialMatrix,
  selectPoseByCheirality,
} from "./essential-matrix";
import type { CameraPose } from "./triangulation";
import type { CameraIntrinsics } from "./geometry";

const intrinsics: CameraIntrinsics = { fx: 500, fy: 500, cx: 256, cy: 256 };
const identity: CameraPose["rotation"] = [1, 0, 0, 0, 1, 0, 0, 0, 1];

// Camera 2 is yawed 0.08 rad and moved 0.3 along +x, world-to-camera convention.
const cos = Math.cos(0.08);
const sin = Math.sin(0.08);
const pose1: CameraPose = { rotation: identity, translation: [0, 0, 0] };
const pose2: CameraPose = { rotation: [cos, 0, sin, 0, 1, 0, -sin, 0, cos], translation: [0.3, 0, 0] };

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

const world: [number, number, number][] = [];
for (const x of [-0.4, -0.15, 0.1, 0.35]) for (const y of [-0.25, 0, 0.25]) for (const z of [2.4, 3.2]) world.push([x, y, z]);

const good1 = world.map((p) => project(pose1, p));
const good2 = world.map((p) => project(pose2, p));
// Deliberate outlier pairs: the second image point is shoved far off its epipolar line.
const bad1 = world.slice(0, 6).map((p) => project(pose1, p));
const bad2 = bad1.map((p) => ({ x: p.x + 47, y: p.y + 31 }));

describe("essentialFromPoses + epipolarInlierMask", () => {
  it("scores true correspondences at zero and rejects gross mismatches", () => {
    const E = essentialFromPoses(pose1, pose2);
    const pts1 = [...good1, ...bad1];
    const pts2 = [...good2, ...bad2];
    const mask = epipolarInlierMask(E, pts1, pts2, intrinsics, 2);
    expect(mask.slice(0, good1.length).every(Boolean)).toBe(true);
    expect(mask.slice(good1.length).some(Boolean)).toBe(false);
  });
});

describe("robustEstimateEssentialMatrix", () => {
  it("finds the inlier set with outliers present", () => {
    seedRandom(12345);
    const pts1 = [...good1, ...bad1];
    const pts2 = [...good2, ...bad2];
    const result = robustEstimateEssentialMatrix(pts1, pts2, intrinsics, { iterations: 400, thresholdPx: 2 });
    expect(result).toBeDefined();
    const goodHits = result!.inliers.slice(0, good1.length).filter(Boolean).length;
    const badHits = result!.inliers.slice(good1.length).filter(Boolean).length;
    expect(goodHits).toBe(good1.length);
    expect(badHits).toBeLessThanOrEqual(1);
  }, 10_000);

  it("returns undefined below the eight-point minimum", () => {
    expect(estimateEssentialMatrix(good1.slice(0, 7), good2.slice(0, 7), intrinsics)).toBeUndefined();
    expect(robustEstimateEssentialMatrix(good1.slice(0, 7), good2.slice(0, 7), intrinsics)).toBeUndefined();
  });
});

describe("decomposeEssentialMatrix + selectPoseByCheirality", () => {
  it("recovers the true relative pose through the cheirality check", () => {
    const E = essentialFromPoses(pose1, pose2);
    const candidates = decomposeEssentialMatrix(E);
    expect(candidates).toHaveLength(4);
    const chosen = selectPoseByCheirality(candidates, good1, good2, intrinsics, 1);
    expect(chosen).toBeDefined();
    // True relative rotation is the yaw itself; true relative translation
    // R2(C1-C2)/|.| = [-cos, 0, sin].
    for (let i = 0; i < 9; i++) {
      expect(chosen!.rotation[i]).toBeCloseTo(pose2.rotation[i]!, 3);
    }
    const t = chosen!.translation;
    const mag = Math.hypot(t[0], t[1], t[2]);
    expect(mag).toBeGreaterThan(0.5);
    expect(t[0]! / mag).toBeCloseTo(-cos, 2);
    expect(t[1]! / mag).toBeCloseTo(0, 2);
    expect(t[2]! / mag).toBeCloseTo(sin, 2);
  });

  it("scales the unit-norm translation by the requested factor", () => {
    const E = essentialFromPoses(pose1, pose2);
    const chosen = selectPoseByCheirality(decomposeEssentialMatrix(E), good1, good2, intrinsics, 0.5);
    expect(Math.hypot(...chosen!.translation)).toBeCloseTo(0.5, 3);
  });
});
