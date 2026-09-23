import { describe, expect, it } from "vitest";
import { buildSchurReducedSystem } from "./schur-blocks";
import { backSubstituteLandmarks } from "./schur-backsubstitution";
import { so3Exp } from "./se3";

describe("bundle numerical blocks", () => {
  it("keeps the identity rotation stable", () => {
    const r = so3Exp([0, 0, 0]);
    expect([...r]).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  });

  it("reduces and back-substitutes a positive landmark block", () => {
    const blocks = {
      camera: { rows: 6, columns: 6, values: new Float64Array(36) },
      cameraLandmark: { rows: 6, columns: 3, values: new Float64Array(18).fill(0.1) },
      landmark: { rows: 3, columns: 3, values: new Float64Array([2, 0, 0, 0, 2, 0, 0, 0, 2]) },
      cameraGradient: new Float64Array(6).fill(0.2),
      landmarkGradient: new Float64Array([0.5, -0.25, 0.125]),
    };
    for (let i = 0; i < 6; i += 1) blocks.camera.values[i * 6 + i] = 2;
    const reduced = buildSchurReducedSystem(blocks, 1e-3);
    expect(reduced).toBeDefined();
    expect(reduced?.landmarkInverses).toHaveLength(1);
    const cameraStep = new Float64Array(6).fill(-0.01);
    const step = backSubstituteLandmarks(blocks, reduced!, cameraStep);
    expect(step).toBeDefined();
    expect([...step!.landmarks].every(Number.isFinite)).toBe(true);
  });
});
