import { describe, expect, it } from "vitest";
import { assembleBundleBlocks } from "./bundle-block-assembly";
import type { BundleLinearization, ObservationLinearization } from "./bundle-linearization";
import { engineAssembleBundleBlocks, type EngineAssemblyObservation } from "../engine/index.js";
import { loadEngineForNode as loadEngine } from "../engine/node-loader.js";

let seed = 163;
function rand(): number {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}
const range = (scale: number) => (rand() - 0.5) * scale;

function randomObservation(cameraId: string, landmarkId: string, valid = true): ObservationLinearization {
  return {
    cameraId,
    landmarkId,
    residual: [range(1), range(1)],
    weight: 0.5 + rand(),
    cameraJacobian: Float64Array.from({ length: 12 }, () => range(2)),
    landmarkJacobian: Float64Array.from({ length: 6 }, () => range(2)),
    valid,
  };
}

describe("bundle-block-assembly Rust/WASM parity", () => {
  it("engineAssembleBundleBlocks agrees with assembleBundleBlocks across a mixed observation set (two free cameras, one fixed-and-skipped, an invalid observation)", async () => {
    await loadEngine();
    const cameraIds = ["cam0", "cam1"]; // non-fixed only, per linearizeBundle's convention
    const landmarkIds = ["lm0", "lm1", "lm2"];

    const observations: ObservationLinearization[] = [
      randomObservation("cam0", "lm0"),
      randomObservation("cam1", "lm0"),
      randomObservation("cam0", "lm1"),
      randomObservation("cam1", "lm2"),
      randomObservation("anchor", "lm2"), // fixed camera, not in cameraIds -> contributes to lm2's landmark block only (no camera block to solve for), per both implementations
      randomObservation("cam1", "lm1", false), // invalid -> excluded before assembly
    ].filter((o) => o.valid);
    // The pre-assembly filter mirrors bundle-optimizer.ts's real usage: only
    // valid observations ever reach assembleBundleBlocks.

    const linearization: BundleLinearization = { observations, cameraIds, landmarkIds };
    const damping = 0.01;
    const huberDelta = 1.5;

    const ts = assembleBundleBlocks(linearization, damping, huberDelta);

    const cameraIndex = new Map(cameraIds.map((id, i) => [id, i]));
    const landmarkIndex = new Map(landmarkIds.map((id, i) => [id, i]));
    const engineObservations: EngineAssemblyObservation[] = observations.map((obs) => ({
      cameraIndex: cameraIndex.get(obs.cameraId),
      landmarkIndex: landmarkIndex.get(obs.landmarkId)!,
      residual: obs.residual,
      weight: obs.weight,
      cameraJacobian: obs.cameraJacobian,
      landmarkJacobian: obs.landmarkJacobian,
    }));
    const wasm = engineAssembleBundleBlocks(engineObservations, cameraIds.length, landmarkIds.length, damping, huberDelta);

    expect(wasm.camera.rows).toBe(ts.camera.rows);
    for (let i = 0; i < ts.camera.values.length; i += 1) expect(wasm.camera.values[i]).toBeCloseTo(ts.camera.values[i]!, 6);
    for (let i = 0; i < ts.cameraLandmark.values.length; i += 1) expect(wasm.cameraLandmark.values[i]).toBeCloseTo(ts.cameraLandmark.values[i]!, 6);
    for (let i = 0; i < ts.landmark.values.length; i += 1) expect(wasm.landmark.values[i]).toBeCloseTo(ts.landmark.values[i]!, 6);
    for (let i = 0; i < ts.cameraGradient.length; i += 1) expect(wasm.cameraGradient[i]).toBeCloseTo(ts.cameraGradient[i]!, 6);
    for (let i = 0; i < ts.landmarkGradient.length; i += 1) expect(wasm.landmarkGradient[i]).toBeCloseTo(ts.landmarkGradient[i]!, 6);
  });

  it("both reject an invalid huberDelta", async () => {
    await loadEngine();
    const linearization: BundleLinearization = { observations: [], cameraIds: [], landmarkIds: [] };
    expect(() => assembleBundleBlocks(linearization, 0, 0)).toThrow();
    expect(() => engineAssembleBundleBlocks([], 0, 0, 0, 0)).toThrow();
  });
});
