import { describe, expect, it } from "vitest";
import { bundleCost, clampVector, predictReduction } from "./bundle-optimizer";
import { assembleBundleBlocks } from "./bundle-block-assembly";
import { linearizeBundle } from "./bundle-linearization";
import { prepareBundleAdjustment } from "./bundle-adjustment";
import type { BundleProblem, CameraBlock } from "./bundle-problem";
import type { Landmark } from "./map";
import {
  engineBundleCost,
  engineClampVector,
  enginePredictReduction,
  enginePrepareBundleAdjustment,
} from "../engine/index.js";
import { loadEngineForNode as loadEngine } from "../engine/node-loader.js";

let seed = 97;
function rand(): number {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}
const range = (scale: number) => (rand() - 0.5) * scale;
const intrinsics = { fx: 480, fy: 480, cx: 320, cy: 240 };
const zeroDistortion = { k1: 0, k2: 0, k3: 0, p1: 0, p2: 0 };

function fixtureProblem(observationCount: number, zeroWeightLast = false): BundleProblem {
  const camera: CameraBlock = { id: "cam", intrinsics, distortion: zeroDistortion, pose: { rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1], translation: [0, 0, 0] }, fixed: true };
  const landmarks: Landmark[] = [];
  const observations: BundleProblem["observations"][number][] = [];
  for (let i = 0; i < observationCount; i += 1) {
    const id = `lm${i}`;
    const world = { x: range(1), y: range(1), z: 1.5 + rand() * 2 };
    landmarks.push({ id, ...world, observations: 2, lastSeenFrame: 0 });
    const projX = intrinsics.fx * world.x / world.z + intrinsics.cx;
    const projY = intrinsics.fy * world.y / world.z + intrinsics.cy;
    // A zero weight on the last observation is bundleCost's actual
    // invalid-input path (`!Number.isFinite(weight) || weight <= 0`), not
    // a magnitude threshold on the residual itself.
    const weight = zeroWeightLast && i === observationCount - 1 ? 0 : 1;
    observations.push({ cameraId: "cam", landmarkId: id, observedX: projX + range(2), observedY: projY + range(2), weight });
  }
  return { cameras: [camera], landmarks, observations };
}

describe("bundle-optimizer Rust/WASM parity", () => {
  it("predictReduction agrees with WASM using real assembled blocks from linearizeBundle", async () => {
    await loadEngine();
    const problem = fixtureProblem(6);
    const linearization = linearizeBundle(problem);
    const blocks = assembleBundleBlocks(linearization, 0, 2);
    const cameraStep = Float64Array.from({ length: blocks.cameraGradient.length }, () => range(0.1));
    const landmarkStep = Float64Array.from({ length: blocks.landmarkGradient.length }, () => range(0.1));

    const ts = predictReduction(blocks, cameraStep, landmarkStep);
    const wasm = enginePredictReduction(blocks.cameraGradient, blocks.camera.values, blocks.landmarkGradient, blocks.landmark.values, blocks.cameraLandmark.values, cameraStep, landmarkStep);
    expect(wasm).toBeCloseTo(ts, 6);
  });

  it("bundleCost agrees with WASM on a real BundleProblem, including the zero-weight Infinity case", async () => {
    await loadEngine();
    for (const zeroWeightLast of [false, true]) {
      const problem = fixtureProblem(5, zeroWeightLast);
      const ts = bundleCost(problem, 1.5);
      const residuals = problem.observations.map((obs) => {
        const [lm] = problem.landmarks.filter((l) => l.id === obs.landmarkId);
        const x = intrinsics.fx * lm!.x / lm!.z + intrinsics.cx;
        const y = intrinsics.fy * lm!.y / lm!.z + intrinsics.cy;
        return [x - obs.observedX, y - obs.observedY, true] as const;
      });
      const weights = problem.observations.map((o) => o.weight ?? 1);
      const wasm = engineBundleCost(residuals, weights, 1.5);
      if (zeroWeightLast) expect(ts).toBe(Infinity);
      expect(Number.isFinite(wasm)).toBe(Number.isFinite(ts));
      if (Number.isFinite(ts)) expect(wasm).toBeCloseTo(ts, 6);
    }
  });

  it("clampVector agrees with WASM: passes short vectors through, scales long ones down", async () => {
    await loadEngine();
    const short = Float64Array.from([0.1, 0.05, 0]);
    const long = Float64Array.from([3, 4, 0]);
    expect(clampVector(short, 1)).toEqual(short);
    expect(engineClampVector(short, 1)).toEqual(short);
    const tsClamped = clampVector(long, 2);
    const wasmClamped = engineClampVector(long, 2);
    for (let i = 0; i < 3; i += 1) expect(wasmClamped[i]).toBeCloseTo(tsClamped[i]!, 9);
  });

  it("prepareBundleAdjustment agrees with WASM across threshold cases", async () => {
    await loadEngine();
    for (const [landmarks, observations] of [[2, 100], [100, 5], [3, 8], [50, 50]] as const) {
      const ts = prepareBundleAdjustment({ landmarks: Array(landmarks).fill({ id: "x", x: 0, y: 0, z: 1, observations: 2, lastSeenFrame: 0 }), observations: Array(observations).fill({ landmarkId: "x", cameraId: "c", observedX: 0, observedY: 0 }) });
      const wasm = enginePrepareBundleAdjustment(landmarks, observations);
      expect(wasm).toBe(ts.status);
    }
  });
});
