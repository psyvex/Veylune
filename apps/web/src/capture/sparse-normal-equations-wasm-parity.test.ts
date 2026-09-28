import { describe, expect, it } from "vitest";
import { accumulateNormalEquations } from "./sparse-normal-equations";
import { engineAccumulateNormalEquations } from "../engine/index.js";
import { loadEngineForNode as loadEngine } from "../engine/node-loader.js";

let seed = 47;
function rand(): number {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}

function sortEntries<T extends { row: number; column: number }>(entries: readonly T[]): readonly T[] {
  return [...entries].sort((a, b) => a.row - b.row || a.column - b.column);
}

describe("sparse-normal-equations Rust/WASM parity", () => {
  it("accumulateNormalEquations agrees with WASM across random Jacobians (entries compared order-independently)", async () => {
    await loadEngine();
    for (const [rows, size] of [[1, 2], [4, 3], [6, 5]] as const) {
      const jacobianRows = Array.from({ length: rows }, () => Float64Array.from({ length: size }, () => (rand() < 0.2 ? 0 : rand() - 0.5)));
      const residuals = Array.from({ length: rows }, () => rand() - 0.5);
      const weights = Array.from({ length: rows }, () => rand());

      const ts = accumulateNormalEquations(jacobianRows, residuals, weights);
      const flat = new Float64Array(rows * size);
      jacobianRows.forEach((row, r) => flat.set(row, r * size));
      const wasm = engineAccumulateNormalEquations(flat, rows, size, Float64Array.from(residuals), Float64Array.from(weights));

      expect(wasm.size).toBe(ts.size);
      for (let i = 0; i < size; i += 1) expect(wasm.gradient[i]).toBeCloseTo(ts.gradient[i]!, 9);

      const tsSorted = sortEntries(ts.entries);
      const wasmSorted = sortEntries(wasm.entries);
      expect(wasmSorted.length).toBe(tsSorted.length);
      for (let i = 0; i < tsSorted.length; i += 1) {
        expect(wasmSorted[i]!.row).toBe(tsSorted[i]!.row);
        expect(wasmSorted[i]!.column).toBe(tsSorted[i]!.column);
        expect(wasmSorted[i]!.value).toBeCloseTo(tsSorted[i]!.value, 9);
      }
    }
  });

  it("both throw on mismatched dimensions", async () => {
    await loadEngine();
    expect(() => accumulateNormalEquations([Float64Array.from([1])], [1, 2], [1, 1])).toThrow();
    expect(() => engineAccumulateNormalEquations(Float64Array.from([1]), 1, 1, Float64Array.from([1, 2]), Float64Array.from([1, 1]))).toThrow();
  });
});
