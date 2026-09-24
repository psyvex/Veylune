import { describe, expect, it } from "vitest";
import { optimizeBundle } from "./bundle-optimizer";
import { computeBundleResiduals, type BundleProblem, type CameraBlock } from "./bundle-problem";
import { projectDistortedPoint } from "./distortion";

const intrinsics = { fx: 500, fy: 500, cx: 320, cy: 240 };
const distortion = { k1: 0, k2: 0, k3: 0, p1: 0, p2: 0 };
const points = [
  { id: "p0", x: -0.7, y: -0.4, z: 4, observations: 2, lastSeenFrame: 1 },
  { id: "p1", x: 0.6, y: -0.5, z: 4.5, observations: 2, lastSeenFrame: 1 },
  { id: "p2", x: -0.5, y: 0.7, z: 5, observations: 2, lastSeenFrame: 1 },
  { id: "p3", x: 0.8, y: 0.6, z: 5.5, observations: 2, lastSeenFrame: 1 },
];
const pose = (translation: readonly [number, number, number]) => ({ rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1] as const, translation });
const camera = (id: string, fixed: boolean, translation: readonly [number, number, number]): CameraBlock => ({ id, fixed, intrinsics, distortion, pose: pose(translation) });
const truthCameras = [camera("anchor", true, [0, 0, 0]), camera("moving", false, [0.15, 0.02, 0])];
const observations = points.flatMap((point) => truthCameras.map((c) => {
  const t = c.pose.translation;
  const pixel = projectDistortedPoint([point.x + t[0], point.y + t[1], point.z + t[2]], intrinsics, distortion)!;
  return { cameraId: c.id, landmarkId: point.id, observedX: pixel[0], observedY: pixel[1] };
}));
const problem: BundleProblem = { cameras: [truthCameras[0]!, camera("moving", false, [0.25, -0.04, 0.03])], landmarks: points, observations };

describe("bundle optimizer LM gain ratio", () => {
  it("accepts improving steps and decreases reprojection cost", () => {
    const initial = cost(problem);
    const result = optimizeBundle(problem, { maxIterations: 12 });
    expect(result.status).toBe("converged");
    expect(result.finalCost).toBeLessThan(initial);
    expect(result.finalCost).toBeLessThan(result.initialCost);
    expect(problem.cameras[1]?.pose.translation).toEqual([0.25, -0.04, 0.03]);
  });

  it("rejects a candidate whose actual objective does not improve", () => {
    const result = optimizeBundle(problem, { maxIterations: 4, maxTranslationStep: 1e-12, maxRotationStep: 1e-12, maxLandmarkStep: 1e-12, initialDamping: 1e-8, maxDamping: 1e-7 });
    expect(["rejected", "converged"]).toContain(result.status);
    expect(result.finalCost).toBeLessThanOrEqual(result.initialCost);
  });
});

function cost(candidate: BundleProblem): number {
  return computeBundleResiduals(candidate).reduce((sum, residual) => sum + residual.residualX ** 2 + residual.residualY ** 2, 0);
}
