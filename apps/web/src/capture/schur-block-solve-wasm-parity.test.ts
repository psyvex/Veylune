import { describe, expect, it } from "vitest";
import { solveBundleSchurBlocks } from "./schur-block-solve";
import type { SchurBlocks } from "./schur-blocks";
import { engineSolveBundleSchurBlocks } from "../engine/index.js";
import { loadEngineForNode as loadEngine } from "../engine/node-loader.js";

let seed = 71;
function rand(): number {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}

/** A random but well-conditioned block system: diagonal-dominant camera and
 * landmark blocks (via `n·I` padding, same trick as
 * linear-solve-wasm-parity.test.ts) so the Schur solve reliably succeeds. */
function randomBlocks(cameraSize: number, landmarkCount: number): SchurBlocks {
  const landmarkSize = landmarkCount * 3;
  const camera = new Float64Array(cameraSize * cameraSize);
  for (let i = 0; i < cameraSize; i += 1) for (let j = 0; j < cameraSize; j += 1) camera[i * cameraSize + j] = (i === j ? cameraSize * 2 : 0) + rand() * 0.1;
  const landmark = new Float64Array(landmarkSize * landmarkSize);
  for (let i = 0; i < landmarkSize; i += 1) for (let j = 0; j < landmarkSize; j += 1) landmark[i * landmarkSize + j] = (i === j ? 10 : 0) + rand() * 0.05;
  const cameraLandmark = Float64Array.from({ length: cameraSize * landmarkSize }, () => (rand() - 0.5) * 0.2);
  const cameraGradient = Float64Array.from({ length: cameraSize }, () => rand() - 0.5);
  const landmarkGradient = Float64Array.from({ length: landmarkSize }, () => rand() - 0.5);
  return {
    camera: { rows: cameraSize, columns: cameraSize, values: camera },
    cameraLandmark: { rows: cameraSize, columns: landmarkSize, values: cameraLandmark },
    landmark: { rows: landmarkSize, columns: landmarkSize, values: landmark },
    cameraGradient,
    landmarkGradient,
  };
}

describe("schur-block-solve Rust/WASM parity", () => {
  it("solveBundleSchurBlocks agrees with WASM across random well-conditioned systems", async () => {
    await loadEngine();
    for (const [cameraSize, landmarkCount] of [[6, 1], [6, 3], [12, 5]] as const) {
      const blocks = randomBlocks(cameraSize, landmarkCount);
      const ts = solveBundleSchurBlocks(blocks, 1e-3);
      const wasm = engineSolveBundleSchurBlocks(
        { camera: blocks.camera, cameraLandmark: blocks.cameraLandmark, landmark: blocks.landmark, cameraGradient: blocks.cameraGradient, landmarkGradient: blocks.landmarkGradient },
        1e-3,
      );
      expect(wasm.status).toBe(ts.status);
      expect(ts.status).toBe("solved");
      for (let i = 0; i < cameraSize; i += 1) expect(wasm.cameraStep[i]).toBeCloseTo(ts.cameraStep[i]!, 6);
      for (let i = 0; i < landmarkCount * 3; i += 1) expect(wasm.landmarkStep[i]).toBeCloseTo(ts.landmarkStep[i]!, 6);
    }
  });

  it("both report insufficient for an empty system", async () => {
    await loadEngine();
    const blocks: SchurBlocks = {
      camera: { rows: 0, columns: 0, values: new Float64Array(0) },
      cameraLandmark: { rows: 0, columns: 0, values: new Float64Array(0) },
      landmark: { rows: 0, columns: 0, values: new Float64Array(0) },
      cameraGradient: new Float64Array(0),
      landmarkGradient: new Float64Array(0),
    };
    expect(solveBundleSchurBlocks(blocks, 1e-3).status).toBe("insufficient");
    expect(engineSolveBundleSchurBlocks(blocks, 1e-3).status).toBe("insufficient");
  });
});
