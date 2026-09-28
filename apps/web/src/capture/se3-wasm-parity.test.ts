import { describe, expect, it } from "vitest";
import { applySE3Increment, so3Exp, type Vec3 } from "./se3";
import { engineApplySe3Increment, engineSo3Exp } from "../engine/index.js";
import { loadEngineForNode as loadEngine } from "../engine/node-loader.js";

/**
 * Numerical parity between `capture/se3.ts` (the shipped implementation)
 * and its Rust/WASM port (`crates/geometry/src/se3.rs`, ADR-013 Stage 1).
 *
 * This is a gate, not a caller switch: per the ADR, the pure-TS math stays
 * the shipped path until this test — and the wider fixture suite it will
 * grow into — has run green in CI for a real stretch of time. Nothing in
 * the live capture pipeline imports the WASM SE3 functions yet.
 */

let seed = 7;
function rand(): number {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}
function randVec3(scale: number): Vec3 {
  return [(rand() - 0.5) * scale, (rand() - 0.5) * scale, (rand() - 0.5) * scale];
}

function expectMatClose(a: readonly number[], b: readonly number[]): void {
  for (let i = 0; i < a.length; i += 1) expect(a[i]).toBeCloseTo(b[i]!, 9);
}

describe("se3 Rust/WASM parity", () => {
  it("so3Exp agrees with the WASM port across random rotations, including the small-angle branch", async () => {
    await loadEngine();
    const omegas: Vec3[] = [
      [0, 0, 0],
      [1e-10, 0, 0],
      [0, 1e-9, 1e-9],
      [Math.PI / 2, 0, 0],
      [0, 0, Math.PI],
      ...Array.from({ length: 40 }, () => randVec3(4 * Math.PI)),
    ];
    for (const omega of omegas) {
      const ts = so3Exp(omega);
      const wasm = engineSo3Exp(omega);
      expectMatClose(ts, wasm);
    }
  });

  it("applySE3Increment agrees with the WASM port across random poses", async () => {
    await loadEngine();
    for (let i = 0; i < 20; i += 1) {
      const rotation = so3Exp(randVec3(2 * Math.PI));
      const translation = randVec3(10);
      const increment = { rotation: randVec3(0.5), translation: randVec3(2) };
      const ts = applySE3Increment(rotation, translation, increment);
      const wasm = engineApplySe3Increment(rotation, translation, increment);
      expectMatClose(ts.rotation, wasm.rotation);
      expectMatClose(ts.translation, wasm.translation);
    }
  });
});
