import { describe, expect, it } from "vitest";
import { optimizeBundle } from "./bundle-optimizer";
import { computeBundleResiduals, type BundleProblem, type CameraBlock } from "./bundle-problem";
import { projectDistortedPoint } from "./distortion";
import { ensureReconstructionEngineReady, isReconstructionEngineReady } from "./reconstruction-engine-bootstrap.js";
import { loadEngineForNode as loadEngine } from "../engine/node-loader.js";

/**
 * Proves the live caller swap in `bundle-optimizer.ts` (ADR-013, Stage 1
 * task 13 — `solveSchurBlocks` routes to `engineSolveBundleSchurBlocks` once
 * `isReconstructionEngineReady()` is true): the same synthetic
 * bundle-adjustment problem `bundle-optimizer.test.ts` uses for the TS-only
 * path must still converge once the engine is loaded and driving the Schur
 * solve. This is the real optimizer loop end to end, not a call-by-call
 * parity check (that's `bundle-optimizer-wasm-parity.test.ts`).
 */

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

function freshProblem(): BundleProblem {
  return { cameras: [truthCameras[0]!, camera("moving", false, [0.25, -0.04, 0.03])], landmarks: points, observations };
}
function cost(candidate: BundleProblem): number {
  return computeBundleResiduals(candidate).reduce((sum, residual) => sum + residual.residualX ** 2 + residual.residualY ** 2, 0);
}

describe("bundle-optimizer live caller swap (engine-driven Schur solve)", () => {
  it("routes through the WASM Schur solve once the engine is ready, and still converges", async () => {
    await loadEngine();
    await ensureReconstructionEngineReady();
    expect(isReconstructionEngineReady()).toBe(true);

    const problem = freshProblem();
    const initial = cost(problem);
    const result = optimizeBundle(problem, { maxIterations: 12 });

    expect(result.status).toBe("converged");
    expect(result.finalCost).toBeLessThan(initial);
    expect(result.finalCost).toBeLessThan(result.initialCost);
    expect(problem.cameras[1]?.pose.translation).toEqual([0.25, -0.04, 0.03]);
  });
});
