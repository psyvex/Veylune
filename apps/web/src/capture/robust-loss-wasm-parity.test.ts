import { describe, expect, it } from "vitest";
import { HuberLoss } from "./robust-loss";
import { engineHuberRhoSquared, engineHuberWeight } from "../engine/index.js";
import { loadEngineForNode as loadEngine } from "../engine/node-loader.js";

describe("robust-loss Rust/WASM parity", () => {
  it("HuberLoss.rhoSquared/weight agree with WASM across a range of deltas and residuals", async () => {
    await loadEngine();
    const deltas = [0.1, 1, 2.5, 10];
    const residualsSquared = [0, 0.001, 0.5, 1, 1.0001, 4, 100, Number.NaN, -1];
    for (const delta of deltas) {
      const loss = new HuberLoss(delta);
      for (const residualSquared of residualsSquared) {
        const tsRho = loss.rhoSquared(residualSquared);
        const wasmRho = engineHuberRhoSquared(delta, residualSquared);
        if (Number.isFinite(tsRho)) expect(wasmRho).toBeCloseTo(tsRho, 9);
        else expect(wasmRho).toBe(tsRho); // both Infinity

        const tsWeight = loss.weight(residualSquared);
        const wasmWeight = engineHuberWeight(delta, residualSquared);
        expect(wasmWeight).toBeCloseTo(tsWeight, 9);
      }
    }
  });

  it("both reject a non-positive delta", async () => {
    await loadEngine();
    expect(() => new HuberLoss(0)).toThrow();
    expect(() => engineHuberRhoSquared(0, 1)).toThrow();
    expect(() => engineHuberWeight(-1, 1)).toThrow();
  });
});
