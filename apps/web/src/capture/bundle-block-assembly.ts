import type { BundleLinearization } from "./bundle-linearization";
import type { SchurBlocks } from "./schur-blocks";
import { HuberLoss } from "./robust-loss";
import { engineAssembleBundleBlocks, type EngineAssemblyObservation } from "../engine/index.js";
import { isReconstructionEngineReady } from "./reconstruction-engine-bootstrap.js";

export function assembleBundleBlocks(
  linearization: BundleLinearization,
  damping = 0,
  huberDelta = 2,
): SchurBlocks {
  const cameraSize = linearization.cameraIds.length * 6;
  const landmarkSize = linearization.landmarkIds.length * 3;
  const camera = new Float64Array(cameraSize * cameraSize);
  const cameraLandmark = new Float64Array(cameraSize * landmarkSize);
  const landmark = new Float64Array(landmarkSize * landmarkSize);
  const cameraGradient = new Float64Array(cameraSize);
  const landmarkGradient = new Float64Array(landmarkSize);
  const cameraIndex = new Map(linearization.cameraIds.map((id, index) => [id, index]));
  const landmarkIndex = new Map(linearization.landmarkIds.map((id, index) => [id, index]));
  const robustLoss = new HuberLoss(huberDelta);

  for (const observation of linearization.observations) {
    if (!observation.valid) continue;
    // `cameraIndex` only has non-fixed cameras (linearizeBundle built
    // cameraIds that way) — `ci === undefined` means this observation's
    // camera is fixed, not that it's missing (a genuinely missing camera
    // was already dropped upstream in linearizeBundle, before an
    // observation ever reaches here). A fixed camera's own block/gradient
    // is correctly skipped below (nothing to solve for — its
    // cameraJacobian is already all-zero), but its landmarkJacobian is
    // real and must still constrain the landmark: previously the whole
    // observation was dropped here, silently discarding the fixed
    // anchor's contribution to every landmark it observes. See
    // docs/75-production-task-pipeline.md Stage 1 task 13 / ADR-014 for
    // the write-up of this fix.
    const li = landmarkIndex.get(observation.landmarkId);
    if (li === undefined) continue;
    const ci = cameraIndex.get(observation.cameraId);
    const lOffset = li * 3;

    const mahalanobisSquared = observation.weight * (observation.residual[0] ** 2 + observation.residual[1] ** 2);
    const weight = observation.weight * robustLoss.weight(mahalanobisSquared);
    for (let residual = 0; residual < 2; residual += 1) {
      const r = observation.residual[residual]!;
      if (ci !== undefined) {
        const cOffset = ci * 6;
        for (let a = 0; a < 6; a += 1) {
          const ja = observation.cameraJacobian[a * 2 + residual]! * weight;
          cameraGradient[cOffset + a] += ja * r;
          for (let b = a; b < 6; b += 1) {
            const jb = observation.cameraJacobian[b * 2 + residual]!;
            const value = ja * jb;
            camera[(cOffset + a) * cameraSize + cOffset + b] += value;
            if (a !== b) camera[(cOffset + b) * cameraSize + cOffset + a] += value;
          }
        }
      }
      for (let a = 0; a < 3; a += 1) {
        const ja = observation.landmarkJacobian[a * 2 + residual]! * weight;
        landmarkGradient[lOffset + a] += ja * r;
        for (let b = a; b < 3; b += 1) {
          const jb = observation.landmarkJacobian[b * 2 + residual]!;
          const value = ja * jb;
          landmark[(lOffset + a) * landmarkSize + lOffset + b] += value;
          if (a !== b) landmark[(lOffset + b) * landmarkSize + lOffset + a] += value;
        }
        if (ci !== undefined) {
          const cOffset = ci * 6;
          for (let b = 0; b < 6; b += 1) {
            const jb = observation.cameraJacobian[b * 2 + residual]!;
            cameraLandmark[(cOffset + b) * landmarkSize + lOffset + a] += jb * ja;
          }
        }
      }
    }
  }

  for (let i = 0; i < cameraSize; i += 1) camera[i * cameraSize + i] += damping;
  for (let i = 0; i < landmarkSize; i += 1) landmark[i * landmarkSize + i] += damping;

  return {
    camera: { rows: cameraSize, columns: cameraSize, values: camera },
    cameraLandmark: { rows: cameraSize, columns: landmarkSize, values: cameraLandmark },
    landmark: { rows: landmarkSize, columns: landmarkSize, values: landmark },
    cameraGradient,
    landmarkGradient,
  };
}

/**
 * Routes `assembleBundleBlocks`'s per-observation accumulation to a single
 * `engineAssembleBundleBlocks` call (ADR-013, Stage 1) — the single most
 * expensive per-observation step in the LM loop, batched into one WASM
 * call instead of one per observation (same pattern as every other routed
 * function here; see `assemble_bundle_blocks`'s Rust module doc, including
 * the pre-existing fixed-camera-skip quirk ported faithfully, not fixed).
 * The `cameraIndex`/`landmarkIndex` `Map` lookups stay TS. Falls back to
 * the pure-TS `assembleBundleBlocks` when the engine isn't ready.
 */
export function assembleBundleBlocksRouted(linearization: BundleLinearization, damping = 0, huberDelta = 2): SchurBlocks {
  if (!isReconstructionEngineReady()) return assembleBundleBlocks(linearization, damping, huberDelta);

  const cameraIndex = new Map(linearization.cameraIds.map((id, index) => [id, index]));
  const landmarkIndex = new Map(linearization.landmarkIds.map((id, index) => [id, index]));
  const observations: EngineAssemblyObservation[] = linearization.observations
    .filter((observation) => observation.valid && landmarkIndex.has(observation.landmarkId))
    .map((observation) => ({
      cameraIndex: cameraIndex.get(observation.cameraId),
      landmarkIndex: landmarkIndex.get(observation.landmarkId)!,
      residual: observation.residual,
      weight: observation.weight,
      cameraJacobian: observation.cameraJacobian,
      landmarkJacobian: observation.landmarkJacobian,
    }));
  return engineAssembleBundleBlocks(observations, linearization.cameraIds.length, linearization.landmarkIds.length, damping, huberDelta);
}
