import { describe, expect, it } from "vitest";
import { distortNormalizedPointWithJacobian, projectDistortedPoint, projectDistortedPointWithJacobian, ZERO_DISTORTION, type RadialTangentialDistortion } from "./distortion";
import { projectPoint, reprojectionErrorPx } from "./reprojection";
import { so3Exp, type Vec3 } from "./se3";
import type { CameraPose } from "./triangulation";
import {
  engineProjectDistortedPoint,
  engineProjectDistortedPointWithJacobian,
  engineProjectPoint,
  engineReprojectionErrorPx,
} from "../engine/index.js";
import { loadEngineForNode as loadEngine } from "../engine/node-loader.js";

/**
 * Numerical parity for the distortion/reprojection port (ADR-013 Stage 1).
 * As with se3-wasm-parity.test.ts, this only proves the Rust and TS
 * implementations agree — nothing in the live pipeline calls the WASM
 * versions yet; the pure-TS modules stay shipped until this has run green
 * in CI for a real stretch.
 */

let seed = 19;
function rand(): number {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}
const range = (scale: number) => (rand() - 0.5) * scale;

const intrinsics = { fx: 480, fy: 480, cx: 320, cy: 240 };
function randomDistortion(): RadialTangentialDistortion {
  return { k1: range(0.4), k2: range(0.1), k3: range(0.02), p1: range(0.01), p2: range(0.01) };
}

describe("distortion/reprojection Rust/WASM parity", () => {
  it("projectDistortedPoint agrees with WASM, including behind-camera rejection", async () => {
    await loadEngine();
    const distortion = randomDistortion();
    const points: Vec3[] = [[0.2, -0.1, 2.0], [0, 0, -1], ...Array.from({ length: 20 }, () => [range(1), range(1), 0.4 + rand() * 5] as Vec3)];
    for (const point of points) {
      const ts = projectDistortedPoint(point, intrinsics, distortion);
      const wasm = engineProjectDistortedPoint(point, intrinsics, distortion);
      expect(wasm).toEqual(ts ? [expect.closeTo(ts[0], 9), expect.closeTo(ts[1], 9)] : undefined);
    }
  });

  it("projectDistortedPointWithJacobian agrees with WASM", async () => {
    await loadEngine();
    const distortion = randomDistortion();
    for (let i = 0; i < 20; i += 1) {
      const point: Vec3 = [range(1), range(1), 0.4 + rand() * 5];
      const ts = projectDistortedPointWithJacobian(point, intrinsics, distortion);
      const wasm = engineProjectDistortedPointWithJacobian(point, intrinsics, distortion);
      expect(ts === undefined).toBe(wasm === undefined);
      if (ts && wasm) {
        expect(wasm.pixel[0]).toBeCloseTo(ts.pixel[0], 6);
        expect(wasm.pixel[1]).toBeCloseTo(ts.pixel[1], 6);
        for (let j = 0; j < 6; j += 1) expect(wasm.jacobian[j]).toBeCloseTo(ts.jacobian[j]!, 6);
      }
    }
  });

  it("distortNormalizedPointWithJacobian sanity check used by both ports", () => {
    // Guards the shared fixture shape above, not a WASM call — the jacobian
    // struct's field order is easy to transpose silently during a port.
    const result = distortNormalizedPointWithJacobian(0.1, 0.2, ZERO_DISTORTION);
    expect(result.point).toEqual([0.1, 0.2]);
    expect(result.jacobian).toEqual([1, 0, 0, 1]);
  });

  it("projectPoint and reprojectionErrorPx agree with WASM across random poses", async () => {
    await loadEngine();
    for (let i = 0; i < 20; i += 1) {
      const pose: CameraPose = { rotation: so3Exp([range(1), range(1), range(1)]), translation: [range(3), range(3), range(3)] };
      const point: Vec3 = [range(1), range(1), 0.4 + rand() * 4];
      const ts = projectPoint(point, intrinsics, pose);
      const wasm = engineProjectPoint(point, intrinsics, pose);
      expect(wasm.valid).toBe(ts.valid);
      if (ts.valid) {
        expect(wasm.x).toBeCloseTo(ts.x, 6);
        expect(wasm.y).toBeCloseTo(ts.y, 6);
        const observed: readonly [number, number] = [ts.x + 0.5, ts.y - 0.3];
        const tsError = reprojectionErrorPx(observed, point, intrinsics, pose);
        const wasmError = engineReprojectionErrorPx(observed, point, intrinsics, pose);
        expect(wasmError).toBeCloseTo(tsError, 6);
      }
    }
  });
});
