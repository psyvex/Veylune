import { describe, expect, it } from "vitest";
import { linearizeBundle } from "./bundle-linearization";
import { computeBundleResiduals, type BundleProblem, type CameraBlock } from "./bundle-problem";
import { applySE3Increment } from "./se3";

const camera: CameraBlock = {
  id: "moving", fixed: false,
  intrinsics: { fx: 720, fy: 705, cx: 320, cy: 240 },
  distortion: { k1: -0.08, k2: 0.012, k3: -0.001, p1: 0.003, p2: -0.002 },
  pose: { rotation: [0.98, -0.08, 0.18, 0.1, 0.99, -0.04, -0.17, 0.06, 0.98], translation: [0.2, -0.1, 0.3] },
};
const landmark = { id: "point", x: 0.3, y: -0.2, z: 4.5, observations: 2, lastSeenFrame: 1 };
const problem: BundleProblem = {
  cameras: [camera], landmarks: [landmark],
  observations: [{ cameraId: camera.id, landmarkId: landmark.id, observedX: 301, observedY: 218 }],
};

describe("analytic bundle linearization", () => {
  it("matches centered finite differences for camera and landmark parameters with distortion", () => {
    const analytic = linearizeBundle(problem).observations[0]!;
    expect(analytic.valid).toBe(true);
    const epsilon = 1e-6;
    for (let column = 0; column < 6; column += 1) {
      const component = column < 3 ? "rotation" : "translation";
      const index = column % 3;
      const plusIncrement = { rotation: [0, 0, 0] as [number, number, number], translation: [0, 0, 0] as [number, number, number] };
      const minusIncrement = { rotation: [0, 0, 0] as [number, number, number], translation: [0, 0, 0] as [number, number, number] };
      plusIncrement[component][index] = epsilon;
      minusIncrement[component][index] = -epsilon;
      const plusPose = applySE3Increment(camera.pose.rotation, camera.pose.translation, plusIncrement);
      const minusPose = applySE3Increment(camera.pose.rotation, camera.pose.translation, minusIncrement);
      const plus = residual({ ...problem, cameras: [{ ...camera, pose: plusPose }] });
      const minus = residual({ ...problem, cameras: [{ ...camera, pose: minusPose }] });
      expect(analytic.cameraJacobian[column * 2]).toBeCloseTo((plus[0] - minus[0]) / (2 * epsilon), 4);
      expect(analytic.cameraJacobian[column * 2 + 1]).toBeCloseTo((plus[1] - minus[1]) / (2 * epsilon), 4);
    }
    for (let column = 0; column < 3; column += 1) {
      const plusPoint = { ...landmark, [(["x", "y", "z"] as const)[column]]: landmark[["x", "y", "z"][column] as "x" | "y" | "z"] + epsilon };
      const minusPoint = { ...landmark, [(["x", "y", "z"] as const)[column]]: landmark[["x", "y", "z"][column] as "x" | "y" | "z"] - epsilon };
      const plus = residual({ ...problem, landmarks: [plusPoint] });
      const minus = residual({ ...problem, landmarks: [minusPoint] });
      expect(analytic.landmarkJacobian[column * 2]).toBeCloseTo((plus[0] - minus[0]) / (2 * epsilon), 4);
      expect(analytic.landmarkJacobian[column * 2 + 1]).toBeCloseTo((plus[1] - minus[1]) / (2 * epsilon), 4);
    }
  });

  it("keeps fixed camera columns zero and marks points behind the camera invalid", () => {
    const fixed = { ...camera, fixed: true };
    const fixedLinearization = linearizeBundle({ ...problem, cameras: [fixed] }).observations[0]!;
    expect([...fixedLinearization.cameraJacobian]).toEqual(new Array(12).fill(0));
    const invalid = linearizeBundle({ ...problem, landmarks: [{ ...landmark, z: -8 }] }).observations[0]!;
    expect(invalid.valid).toBe(false);
  });
});

function residual(candidate: BundleProblem): readonly [number, number] {
  const value = computeBundleResiduals(candidate)[0]!;
  if (!value.valid) throw new Error("Expected a valid perturbed reprojection.");
  return [value.residualX, value.residualY];
}
