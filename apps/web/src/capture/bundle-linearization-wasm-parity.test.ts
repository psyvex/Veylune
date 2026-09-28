import { describe, expect, it } from "vitest";
import { linearizeBundle } from "./bundle-linearization";
import type { BundleProblem, CameraBlock } from "./bundle-problem";
import type { Landmark } from "./map";
import type { RadialTangentialDistortion } from "./distortion";
import { engineLinearizeObservation } from "../engine/index.js";
import { loadEngineForNode as loadEngine } from "../engine/node-loader.js";

let seed = 83;
function rand(): number {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}
const range = (scale: number) => (rand() - 0.5) * scale;

const intrinsics = { fx: 480, fy: 480, cx: 320, cy: 240 };

function randomDistortion(): RadialTangentialDistortion {
  return { k1: range(0.2), k2: range(0.05), k3: 0, p1: range(0.005), p2: range(0.005) };
}

describe("bundle-linearization Rust/WASM parity", () => {
  it("engineLinearizeObservation agrees with linearizeBundle's per-observation result, for both fixed and free cameras", async () => {
    await loadEngine();
    for (const fixed of [false, true]) {
      for (let i = 0; i < 15; i += 1) {
        const distortion = randomDistortion();
        const camera: CameraBlock = {
          id: "cam",
          intrinsics,
          distortion,
          pose: { rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1], translation: [range(0.5), range(0.5), range(0.5)] },
          fixed,
        };
        const landmark: Landmark = { id: "lm", x: range(1), y: range(1), z: 1.0 + rand() * 3, observations: 2, lastSeenFrame: 0 };
        const observed: readonly [number, number] = [320 + range(20), 240 + range(20)];
        const weight = 0.5 + rand();

        const problem: BundleProblem = {
          cameras: [camera],
          landmarks: [landmark],
          observations: [{ cameraId: "cam", landmarkId: "lm", observedX: observed[0], observedY: observed[1], weight }],
        };
        const ts = linearizeBundle(problem).observations[0]!;
        const wasm = engineLinearizeObservation(intrinsics, distortion, camera.pose, fixed, [landmark.x, landmark.y, landmark.z], observed, weight);

        expect(wasm.valid).toBe(ts.valid);
        expect(wasm.residual[0]).toBeCloseTo(ts.residual[0], 6);
        expect(wasm.residual[1]).toBeCloseTo(ts.residual[1], 6);
        for (let k = 0; k < 12; k += 1) expect(wasm.cameraJacobian[k]).toBeCloseTo(ts.cameraJacobian[k]!, 5);
        for (let k = 0; k < 6; k += 1) expect(wasm.landmarkJacobian[k]).toBeCloseTo(ts.landmarkJacobian[k]!, 5);
      }
    }
  });

  it("both mark a point behind the camera invalid", async () => {
    await loadEngine();
    const camera: CameraBlock = { id: "cam", intrinsics, distortion: { k1: 0, k2: 0, k3: 0, p1: 0, p2: 0 }, pose: { rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1], translation: [0, 0, 0] }, fixed: false };
    const landmark: Landmark = { id: "lm", x: 0.1, y: 0.1, z: -1, observations: 2, lastSeenFrame: 0 };
    const problem: BundleProblem = { cameras: [camera], landmarks: [landmark], observations: [{ cameraId: "cam", landmarkId: "lm", observedX: 320, observedY: 240, weight: 1 }] };
    const ts = linearizeBundle(problem).observations[0]!;
    const wasm = engineLinearizeObservation(intrinsics, camera.distortion, camera.pose, false, [landmark.x, landmark.y, landmark.z], [320, 240], 1);
    expect(ts.valid).toBe(false);
    expect(wasm.valid).toBe(false);
  });
});
