import { describe, expect, it } from "vitest";
import { solvePositiveDefinite, type DenseLinearSystem } from "./linear-solve";
import { engineSolvePositiveDefinite } from "../engine/index.js";
import { loadEngineForNode as loadEngine } from "../engine/node-loader.js";

let seed = 31;
function rand(): number {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}

/** Builds a random symmetric positive-definite `n x n` system: `A = MᵀM +
 * n·I` is always SPD for any real `M`. */
function randomSpdSystem(n: number): DenseLinearSystem {
  const m = Float64Array.from({ length: n * n }, () => (rand() - 0.5) * 4);
  const matrix = new Float64Array(n * n);
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      let sum = i === j ? n : 0;
      for (let k = 0; k < n; k += 1) sum += m[k * n + i]! * m[k * n + j]!;
      matrix[i * n + j] = sum;
    }
  }
  const rhs = Float64Array.from({ length: n }, () => (rand() - 0.5) * 10);
  return { size: n, matrix, rhs };
}

describe("linear-solve Rust/WASM parity", () => {
  it("solvePositiveDefinite agrees with WASM across random SPD systems", async () => {
    await loadEngine();
    for (const n of [1, 2, 3, 5, 8]) {
      const system = randomSpdSystem(n);
      const ts = solvePositiveDefinite(system);
      const wasm = engineSolvePositiveDefinite(system.size, system.matrix, system.rhs);
      expect(ts === undefined).toBe(wasm === undefined);
      if (ts && wasm) for (let i = 0; i < n; i += 1) expect(wasm[i]).toBeCloseTo(ts[i]!, 6);
    }
  });

  it("both reject a non-positive-definite (all-zero) matrix", async () => {
    await loadEngine();
    const system: DenseLinearSystem = { size: 2, matrix: new Float64Array(4), rhs: Float64Array.from([1, 1]) };
    expect(solvePositiveDefinite(system)).toBeUndefined();
    expect(engineSolvePositiveDefinite(2, system.matrix, system.rhs)).toBeUndefined();
  });
});
