import { describe, expect, it } from "vitest";
import { HuberLoss } from "./robust-loss";
import { solvePositiveDefinite } from "./linear-solve";
import { so3Exp } from "./se3";
import { buildSchurReducedSystem } from "./schur-blocks";

const identity3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

describe("capture numerical foundations", () => {
  it("computes a finite Huber weight for an outlier", () => {
    const loss = new HuberLoss(2);
    expect(loss.weight(100)).toBeCloseTo(0.2);
    expect(loss.rhoSquared(100)).toBeGreaterThan(0);
  });

  it("solves a positive-definite system", () => {
    const result = solvePositiveDefinite({ size: 2, matrix: new Float64Array([4, 1, 1, 3]), rhs: new Float64Array([1, 2]) });
    expect(result).toBeDefined();
    expect(result![0]).toBeCloseTo(1 / 11);
    expect(result![1]).toBeCloseTo(7 / 11);
  });

  it("keeps the SO3 exponential finite near zero", () => {
    const rotation = so3Exp([1e-10, -2e-10, 3e-10]);
    expect(rotation.every(Number.isFinite)).toBe(true);
    expect(rotation[0]).toBeCloseTo(1);
    expect(rotation[4]).toBeCloseTo(1);
    expect(rotation[8]).toBeCloseTo(1);
  });

  it("reduces a valid damped Schur system with 6-DoF camera and 3-DoF landmark blocks", () => {
    const camera = new Float64Array(36);
    for (let i = 0; i < 6; i += 1) camera[i * 6 + i] = 4;
    const cameraLandmark = new Float64Array(18);
    cameraLandmark[0] = 1;
    cameraLandmark[7] = 1;
    cameraLandmark[14] = 1;
    const landmark = new Float64Array([2, 0, 0, 0, 2, 0, 0, 0, 2]);
    const result = buildSchurReducedSystem({
      camera: { rows: 6, columns: 6, values: camera },
      cameraLandmark: { rows: 6, columns: 3, values: cameraLandmark },
      landmark: { rows: 3, columns: 3, values: landmark },
      cameraGradient: new Float64Array([1, 2, 3, 4, 5, 6]),
      landmarkGradient: new Float64Array([1, 1, 1]),
    }, 0.1);
    expect(result).toBeDefined();
    expect(result!.hessian.values.every(Number.isFinite)).toBe(true);
    expect(result!.gradient.every(Number.isFinite)).toBe(true);
    expect(result!.landmarkInverses).toHaveLength(1);
  });

  it("has the expected identity fixture shape", () => {
    expect(identity3).toHaveLength(9);
  });
});
