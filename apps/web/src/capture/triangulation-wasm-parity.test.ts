import { describe, expect, it } from "vitest";
import { triangulateCorrespondences, type CameraPose } from "./triangulation";
import { so3Exp, type Vec3 } from "./se3";
import { engineTriangulatePoint } from "../engine/index.js";
import { loadEngineForNode as loadEngine } from "../engine/node-loader.js";

let seed = 61;
function rand(): number {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}
const range = (scale: number) => (rand() - 0.5) * scale;

const intrinsics = { fx: 480, fy: 480, cx: 320, cy: 240 };

describe("triangulation Rust/WASM parity", () => {
  it("engineTriangulatePoint agrees with triangulateCorrespondences' per-match result across random poses/points", async () => {
    await loadEngine();
    let acceptedCount = 0;
    for (let i = 0; i < 20; i += 1) {
      const referencePose: CameraPose = { rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1], translation: [0, 0, 0] };
      const currentPose: CameraPose = { rotation: so3Exp([range(0.2), range(0.2), range(0.2)] as Vec3), translation: [range(0.6) + 0.2, range(0.2), range(0.2)] };

      const world: Vec3 = [range(1), range(1), 1.0 + rand() * 3];
      // triangulateCorrespondences's unprojectRay treats pose.translation as
      // the camera CENTER in world space (ray origin = translation
      // directly, reprojection check computes R*(X - translation)) — not
      // the standard world-to-camera `t` in `X_cam = R*X + t` that
      // reprojection.ts uses for the rest of the pipeline. This was
      // previously (wrongly) projected with the latter, which silently
      // rejected every point below and made the `if` block dead code —
      // the outer `expect` was comparing `false === false` every iteration.
      const projectInto = (pose: CameraPose): [number, number] => {
        const r = pose.rotation; const c = pose.translation;
        const lx = world[0] - c[0], ly = world[1] - c[1], lz = world[2] - c[2];
        const cx = r[0] * lx + r[1] * ly + r[2] * lz;
        const cy = r[3] * lx + r[4] * ly + r[5] * lz;
        const cz = r[6] * lx + r[7] * ly + r[8] * lz;
        return [intrinsics.fx * cx / cz + intrinsics.cx, intrinsics.fy * cy / cz + intrinsics.cy];
      };
      const referencePx = projectInto(referencePose);
      const currentPx = projectInto(currentPose);

      const reference = [{ x: referencePx[0], y: referencePx[1], score: 1 }];
      const current = [{ x: currentPx[0], y: currentPx[1], score: 1 }];
      const matches = [{ referenceIndex: 0, currentIndex: 0, distance: 0 }];

      const ts = triangulateCorrespondences(reference, current, matches, intrinsics, referencePose, currentPose, 5);
      const wasm = engineTriangulatePoint(intrinsics, referencePose, currentPose, referencePx, currentPx, 5);

      expect(ts.points.length > 0).toBe(wasm !== undefined);
      if (ts.points.length > 0 && wasm) {
        acceptedCount += 1;
        const point = ts.points[0]!;
        expect(wasm.x).toBeCloseTo(point.x, 5);
        expect(wasm.y).toBeCloseTo(point.y, 5);
        expect(wasm.z).toBeCloseTo(point.z, 5);
        expect(wasm.reprojectionErrorPx).toBeCloseTo(point.reprojectionErrorPx, 5);
      }
    }
    // The old version of this fixture (a different, incompatible projection
    // convention) never reached the branch above — this failed silently as
    // `false === false` every iteration. Assert it actually does now.
    expect(acceptedCount).toBeGreaterThan(0);
  });
});
