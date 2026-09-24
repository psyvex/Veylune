import { describe, expect, it } from "vitest";
import { assembleBundleBlocks } from "./bundle-block-assembly";
import { assembleBundleBlocks as assembleLegacyBlocks } from "./bundle-blocks";
import type { BundleLinearization } from "./bundle-linearization";
import { HuberLoss } from "./robust-loss";

const observation = (weight: number) => ({
  cameraId: "c", landmarkId: "p", residual: [10, 0] as const, weight,
  cameraJacobian: new Float64Array([1, 0, ...new Array(10).fill(0)]),
  landmarkJacobian: new Float64Array([1, 0, 0, 0, 0, 0]), valid: true,
});

describe("weighted robust block assembly", () => {
  it("combines observation precision with the Huber influence weight", () => {
    const linearization: BundleLinearization = { cameraIds: ["c"], landmarkIds: ["p"], observations: [observation(1), observation(0.01)] };
    const blocks = assembleBundleBlocks(linearization);
    // The full weight is 0.2 * JᵀJ; the low precision point has weight 0.01 * JᵀJ.
    expect(blocks.camera.values[0]).toBeCloseTo(0.21, 10);
    expect(blocks.landmark.values[0]).toBeCloseTo(0.21, 10);
    expect(blocks.cameraGradient[0]).toBeCloseTo(2.1, 10);
  });

  it("skips invalid observations instead of contaminating the normal equations", () => {
    const invalid = { ...observation(1), valid: false };
    const blocks = assembleBundleBlocks({ cameraIds: ["c"], landmarkIds: ["p"], observations: [invalid] });
    expect([...blocks.camera.values].every((value) => value === 0)).toBe(true);
    expect([...blocks.landmark.values].every((value) => value === 0)).toBe(true);
  });

  it("keeps the alternate block assembler consistent with weighted derivatives", () => {
    const linearization: BundleLinearization = { cameraIds: ["c"], landmarkIds: ["p"], observations: [observation(1), observation(0.01)] };
    const blocks = assembleLegacyBlocks(linearization, new HuberLoss(2));
    expect(blocks.camera.values[0]).toBeCloseTo(0.21, 10);
    expect(blocks.landmark.values[0]).toBeCloseTo(0.21, 10);
  });
});
