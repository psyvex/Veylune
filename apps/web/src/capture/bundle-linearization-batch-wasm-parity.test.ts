import { describe, expect, it } from "vitest";
import { linearizeBundle } from "./bundle-linearization";
import type { BundleProblem, CameraBlock } from "./bundle-problem";
import type { Landmark } from "./map";
import { engineLinearizeObservations, type EngineObservationLinearizeInput } from "../engine/index.js";
import { loadEngineForNode as loadEngine } from "../engine/node-loader.js";

let seed = 131;
function rand(): number {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}
const range = (scale: number) => (rand() - 0.5) * scale;

const intrinsics = { fx: 480, fy: 480, cx: 320, cy: 240 };

describe("bundle-linearization batched Rust/WASM parity", () => {
  it("engineLinearizeObservations agrees with linearizeBundle across a mixed observation list (multiple cameras, some fixed, some invalid)", async () => {
    await loadEngine();

    const cameras: CameraBlock[] = [
      { id: "anchor", intrinsics, distortion: { k1: 0, k2: 0, k3: 0, p1: 0, p2: 0 }, pose: { rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1], translation: [0, 0, 0] }, fixed: true },
      { id: "moving", intrinsics, distortion: { k1: 0.05, k2: -0.01, k3: 0, p1: 0.002, p2: -0.001 }, pose: { rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1], translation: [range(0.5), range(0.5), range(0.3)] }, fixed: false },
    ];
    const landmarks: Landmark[] = Array.from({ length: 12 }, (_, i) => ({ id: `lm${i}`, x: range(1), y: range(1), z: 1.0 + rand() * 3, observations: 2, lastSeenFrame: 0 }));
    // One landmark behind the camera in its own frame, to exercise the "invalid" path too.
    landmarks.push({ id: "behind", x: 0, y: 0, z: -1, observations: 2, lastSeenFrame: 0 });

    const observations = landmarks.flatMap((lm) => cameras.map((cam) => ({
      cameraId: cam.id, landmarkId: lm.id,
      observedX: 320 + range(30), observedY: 240 + range(30),
      weight: 0.5 + rand(),
    })));
    const problem: BundleProblem = { cameras, landmarks, observations };

    const ts = linearizeBundle(problem);
    const cameraMap = new Map(cameras.map((c) => [c.id, c]));
    const landmarkMap = new Map(landmarks.map((l) => [l.id, l]));
    const inputs: EngineObservationLinearizeInput[] = observations.map((obs) => {
      const camera = cameraMap.get(obs.cameraId)!;
      const landmark = landmarkMap.get(obs.landmarkId)!;
      return { intrinsics: camera.intrinsics, distortion: camera.distortion, cameraPose: camera.pose, cameraFixed: camera.fixed, landmark: [landmark.x, landmark.y, landmark.z], observed: [obs.observedX, obs.observedY], weight: obs.weight ?? 1 };
    });
    const wasm = engineLinearizeObservations(inputs);

    expect(wasm.length).toBe(ts.observations.length);
    ts.observations.forEach((tsResult, i) => {
      const wasmResult = wasm[i]!;
      expect(wasmResult.valid).toBe(tsResult.valid);
      expect(wasmResult.residual[0]).toBeCloseTo(tsResult.residual[0], 5);
      expect(wasmResult.residual[1]).toBeCloseTo(tsResult.residual[1], 5);
      for (let k = 0; k < 12; k += 1) expect(wasmResult.cameraJacobian[k]).toBeCloseTo(tsResult.cameraJacobian[k]!, 4);
      for (let k = 0; k < 6; k += 1) expect(wasmResult.landmarkJacobian[k]).toBeCloseTo(tsResult.landmarkJacobian[k]!, 4);
    });
  });

  it("handles an empty observation list", async () => {
    await loadEngine();
    expect(engineLinearizeObservations([])).toEqual([]);
  });
});
