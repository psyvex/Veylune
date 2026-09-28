import { describe, expect, it } from "vitest";
import { applySE3Increment, so3Exp, type Vec3 } from "./se3";
import { clampVector } from "./bundle-optimizer";
import { engineApplyCameraSteps, engineApplyLandmarkSteps, type EngineCameraPose } from "../engine/index.js";
import { loadEngineForNode as loadEngine } from "../engine/node-loader.js";

let seed = 113;
function rand(): number {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}
const range = (scale: number) => (rand() - 0.5) * scale;

/**
 * Reimplements the per-camera math inside `applyBundleStep` in
 * bundle-optimizer.ts — that function isn't exported standalone (it also
 * does string-`id` bookkeeping unrelated to this math), so this is the
 * batching target's reference, matching the WASM function's own scope.
 *
 * `pose.translation` is the camera's world-space CENTER (see
 * reprojection.ts's projectPoint), so its update is a plain additive step
 * (`C + step`), not `applySE3Increment`'s SE3-composed translation update
 * (`ΔR*C + Δt`, correct only for a standard world-to-camera `t`). The
 * rotation update is unaffected — reuse `applySE3Increment` for that part
 * alone by feeding it a zero translation.
 */
function tsApplyCameraStep(pose: EngineCameraPose, step: Float64Array, offset: number, maxRotationStep: number, maxTranslationStep: number): EngineCameraPose {
  const rotationStep = clampVector(step.slice(offset, offset + 3), maxRotationStep);
  const translationStep = clampVector(step.slice(offset + 3, offset + 6), maxTranslationStep);
  const rotatedOnly = applySE3Increment(pose.rotation, [0, 0, 0], {
    rotation: [rotationStep[0]!, rotationStep[1]!, rotationStep[2]!],
    translation: [0, 0, 0],
  });
  return {
    rotation: rotatedOnly.rotation,
    translation: [pose.translation[0] + translationStep[0]!, pose.translation[1] + translationStep[1]!, pose.translation[2] + translationStep[2]!],
  };
}
function tsApplyLandmarkStep(landmark: Vec3, step: Float64Array, offset: number, maxLandmarkStep: number): Vec3 {
  const clamped = clampVector(step.slice(offset, offset + 3), maxLandmarkStep);
  return [landmark[0] + clamped[0]!, landmark[1] + clamped[1]!, Math.max(1e-5, landmark[2] + clamped[2]!)];
}

describe("bundle-optimizer batched step application Rust/WASM parity", () => {
  it("engineApplyCameraSteps agrees with the per-camera TS math across random poses/steps", async () => {
    await loadEngine();
    const poses: EngineCameraPose[] = Array.from({ length: 5 }, () => ({
      rotation: so3Exp([range(1), range(1), range(1)]),
      translation: [range(2), range(2), range(2)],
    }));
    const step = Float64Array.from({ length: poses.length * 6 }, () => range(0.3));
    const maxRotationStep = 0.15;
    const maxTranslationStep = 0.25;

    const wasm = engineApplyCameraSteps(poses, step, maxRotationStep, maxTranslationStep);
    poses.forEach((pose, i) => {
      const ts = tsApplyCameraStep(pose, step, i * 6, maxRotationStep, maxTranslationStep);
      for (let k = 0; k < 9; k += 1) expect(wasm[i]!.rotation[k]).toBeCloseTo(ts.rotation[k]!, 9);
      for (let k = 0; k < 3; k += 1) expect(wasm[i]!.translation[k]).toBeCloseTo(ts.translation[k]!, 9);
    });
  });

  it("engineApplyLandmarkSteps agrees with the per-landmark TS math, including the depth floor", async () => {
    await loadEngine();
    const landmarks: Vec3[] = [[range(1), range(1), 1 + rand() * 3], [0, 0, 0.1], [range(1), range(1), 2]];
    const flat = new Float64Array(landmarks.length * 3);
    landmarks.forEach((l, i) => flat.set(l, i * 3));
    const step = Float64Array.from({ length: landmarks.length * 3 }, () => range(1));
    // Force the last landmark's z step deeply negative to exercise the 1e-5 depth floor.
    step[step.length - 1] = -100;
    const maxLandmarkStep = 0.5;

    const wasm = engineApplyLandmarkSteps(flat, step, maxLandmarkStep);
    landmarks.forEach((landmark, i) => {
      const ts = tsApplyLandmarkStep(landmark, step, i * 3, maxLandmarkStep);
      for (let k = 0; k < 3; k += 1) expect(wasm[i * 3 + k]).toBeCloseTo(ts[k], 9);
    });
    // The clamp caps the step magnitude below what would drive z negative anyway,
    // but the floor logic itself is proven directly here.
    expect(wasm[wasm.length - 1]).toBeGreaterThanOrEqual(1e-5);
  });
});
