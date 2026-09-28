import { describe, expect, it } from "vitest";
import { triangulateCorrespondences, type CameraPose } from "./triangulation";
import { so3Exp, type Vec3 } from "./se3";
import { engineTriangulatePoints } from "../engine/index.js";
import { loadEngineForNode as loadEngine } from "../engine/node-loader.js";

let seed = 149;
function rand(): number {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}
const range = (scale: number) => (rand() - 0.5) * scale;

const intrinsics = { fx: 480, fy: 480, cx: 320, cy: 240 };

describe("triangulation batched Rust/WASM parity", () => {
  it("engineTriangulatePoints agrees with triangulateCorrespondences across a mixed match list (good parallax + near-zero-parallax rejections)", async () => {
    await loadEngine();
    const referencePose: CameraPose = { rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1], translation: [0, 0, 0] };
    const currentPose: CameraPose = { rotation: so3Exp([range(0.15), range(0.15), range(0.15)] as Vec3), translation: [0.3 + range(0.1), range(0.1), range(0.1)] };

    // triangulateCorrespondences's unprojectRay treats pose.translation as
    // the camera CENTER in world space (ray origin = translation directly,
    // and its reprojection check computes R*(X - translation)) — NOT the
    // standard world-to-camera `t` in `X_cam = R*X + t` that reprojection.ts
    // uses. These are different conventions for the same CameraPose shape;
    // projecting with the wrong one silently rejects every point (self-
    // consistent wrong rays -> huge reprojection error -> always over
    // threshold). Match the function under test's actual convention here.
    const project = (world: Vec3, pose: CameraPose): [number, number] => {
      const r = pose.rotation; const c = pose.translation;
      const lx = world[0] - c[0], ly = world[1] - c[1], lz = world[2] - c[2];
      const x = r[0] * lx + r[1] * ly + r[2] * lz;
      const y = r[3] * lx + r[4] * ly + r[5] * lz;
      const z = r[6] * lx + r[7] * ly + r[8] * lz;
      return [intrinsics.fx * x / z + intrinsics.cx, intrinsics.fy * y / z + intrinsics.cy];
    };

    const reference: { x: number; y: number; score: number }[] = [];
    const current: { x: number; y: number; score: number }[] = [];
    const matches: { referenceIndex: number; currentIndex: number; distance: number }[] = [];
    const pixelPairs: number[] = [];

    for (let i = 0; i < 15; i += 1) {
      const world: Vec3 = [range(1), range(1), 1.0 + rand() * 3];
      const refPx = project(world, referencePose);
      const curPx = i % 4 === 0 ? refPx : project(world, currentPose); // every 4th match has zero parallax -> rejected
      reference.push({ x: refPx[0], y: refPx[1], score: 1 });
      current.push({ x: curPx[0], y: curPx[1], score: 1 });
      matches.push({ referenceIndex: i, currentIndex: i, distance: 0 });
      pixelPairs.push(refPx[0], refPx[1], curPx[0], curPx[1]);
    }

    const ts = triangulateCorrespondences(reference, current, matches, intrinsics, referencePose, currentPose, 5);
    const wasm = engineTriangulatePoints(intrinsics, referencePose, currentPose, Float64Array.from(pixelPairs), 5);

    expect(wasm.length).toBe(matches.length);
    let acceptedCount = 0;
    for (let i = 0; i < matches.length; i += 1) {
      const wasmResult = wasm[i];
      const tsMatch = ts.points.find((p) => p.match.referenceIndex === i);
      expect(wasmResult !== undefined).toBe(tsMatch !== undefined);
      if (wasmResult && tsMatch) {
        acceptedCount += 1;
        expect(wasmResult.x).toBeCloseTo(tsMatch.x, 5);
        expect(wasmResult.y).toBeCloseTo(tsMatch.y, 5);
        expect(wasmResult.z).toBeCloseTo(tsMatch.z, 5);
        expect(wasmResult.reprojectionErrorPx).toBeCloseTo(tsMatch.reprojectionErrorPx, 5);
      }
    }
    // Sanity: the fixture actually exercises both the accept and reject paths.
    expect(acceptedCount).toBeGreaterThan(0);
    expect(acceptedCount).toBeLessThan(matches.length);
  });

  it("handles an empty correspondence list", async () => {
    await loadEngine();
    const pose: CameraPose = { rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1], translation: [0, 0, 0] };
    expect(engineTriangulatePoints(intrinsics, pose, pose, new Float64Array(0), 5)).toEqual([]);
  });
});
