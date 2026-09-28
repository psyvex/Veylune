import { describe, expect, it } from "vitest";
import { computeBundleResiduals, computeBundleResidualsRouted } from "./bundle-problem";
import type { BundleProblem, CameraBlock } from "./bundle-problem";
import type { Landmark } from "./map";
import { loadEngineForNode as loadEngine } from "../engine/node-loader.js";

let seed = 179;
function rand(): number {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}
const range = (scale: number) => (rand() - 0.5) * scale;
const intrinsics = { fx: 480, fy: 480, cx: 320, cy: 240 };

describe("computeBundleResidualsRouted Rust/WASM parity", () => {
  it("agrees with computeBundleResiduals across a mixed problem (two cameras, one fixed, a missing-camera observation, a behind-camera landmark)", async () => {
    await loadEngine();
    const cameras: CameraBlock[] = [
      { id: "anchor", intrinsics, distortion: { k1: 0, k2: 0, k3: 0, p1: 0, p2: 0 }, pose: { rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1], translation: [0, 0, 0] }, fixed: true },
      { id: "moving", intrinsics, distortion: { k1: 0.03, k2: -0.005, k3: 0, p1: 0.001, p2: -0.001 }, pose: { rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1], translation: [range(0.4), range(0.4), range(0.2)] }, fixed: false },
    ];
    const landmarks: Landmark[] = Array.from({ length: 8 }, (_, i) => ({ id: `lm${i}`, x: range(1), y: range(1), z: 1.0 + rand() * 3, observations: 2, lastSeenFrame: 0 }));
    landmarks.push({ id: "behind", x: 0, y: 0, z: -2, observations: 2, lastSeenFrame: 0 });

    const observations = landmarks.flatMap((lm) => cameras.map((cam) => ({ cameraId: cam.id, landmarkId: lm.id, observedX: 320 + range(30), observedY: 240 + range(30) })));
    observations.push({ cameraId: "ghost-camera", landmarkId: landmarks[0]!.id, observedX: 100, observedY: 100 });

    const problem: BundleProblem = { cameras, landmarks, observations };
    const ts = computeBundleResiduals(problem);
    const wasm = computeBundleResidualsRouted(problem);

    expect(wasm.length).toBe(ts.length);
    let validCount = 0;
    for (let i = 0; i < ts.length; i += 1) {
      expect(wasm[i]!.valid).toBe(ts[i]!.valid);
      expect(wasm[i]!.landmarkId).toBe(ts[i]!.landmarkId);
      expect(wasm[i]!.cameraId).toBe(ts[i]!.cameraId);
      if (ts[i]!.valid) {
        validCount += 1;
        expect(wasm[i]!.residualX).toBeCloseTo(ts[i]!.residualX, 5);
        expect(wasm[i]!.residualY).toBeCloseTo(ts[i]!.residualY, 5);
      }
    }
    expect(validCount).toBeGreaterThan(0);
  });
});
