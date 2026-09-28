import type { CameraIntrinsics } from "./geometry";
import type { CameraPose } from "./triangulation";
import type { Landmark } from "./map";
import type { BundleAdjustmentObservation } from "./bundle-adjustment";
import type { RadialTangentialDistortion } from "./distortion";
import { projectDistortedPoint } from "./distortion";
import { engineLinearizeObservations, type EngineObservationLinearizeInput } from "../engine/index.js";
import { isReconstructionEngineReady } from "./reconstruction-engine-bootstrap.js";

export interface CameraBlock {
  readonly id: string;
  readonly intrinsics: CameraIntrinsics;
  readonly distortion: RadialTangentialDistortion;
  readonly pose: CameraPose;
  readonly fixed: boolean;
}

export interface BundleProblem {
  readonly cameras: readonly CameraBlock[];
  readonly landmarks: readonly Landmark[];
  readonly observations: readonly BundleAdjustmentObservation[];
}

export interface BundleResidual {
  readonly landmarkId: string;
  readonly cameraId: string;
  readonly residualX: number;
  readonly residualY: number;
  readonly valid: boolean;
}

export function computeBundleResiduals(problem: BundleProblem): readonly BundleResidual[] {
  const cameras = new Map(problem.cameras.map((camera) => [camera.id, camera]));
  const landmarks = new Map(problem.landmarks.map((landmark) => [landmark.id, landmark]));
  const residuals: BundleResidual[] = [];

  for (const observation of problem.observations) {
    const camera = cameras.get(observation.cameraId);
    const landmark = landmarks.get(observation.landmarkId);
    if (!camera || !landmark) {
      residuals.push({ landmarkId: observation.landmarkId, cameraId: observation.cameraId, residualX: 0, residualY: 0, valid: false });
      continue;
    }

    const projected = projectWorldPoint(landmark, camera);
    if (!projected) {
      residuals.push({ landmarkId: landmark.id, cameraId: camera.id, residualX: 0, residualY: 0, valid: false });
      continue;
    }

    residuals.push({
      landmarkId: landmark.id,
      cameraId: camera.id,
      residualX: projected[0] - observation.observedX,
      residualY: projected[1] - observation.observedY,
      valid: Number.isFinite(projected[0]) && Number.isFinite(projected[1]),
    });
  }
  return residuals;
}

/**
 * Routes `computeBundleResiduals`'s per-observation projection to the
 * already-routed, already-batched `engineLinearizeObservations` (ADR-013,
 * Stage 1) — no new Rust code: the residual `computeBundleResiduals` needs
 * is exactly `linearizeObservation`'s `residual` field, computed with the
 * same `q = R*(P - C)` projection, so reusing it (and discarding the
 * Jacobians it also computes) avoids a near-duplicate WASM export for a
 * strictly cheaper subset of the same math. The `camera`/`landmark` `Map`
 * lookups stay TS, same as every other routed function here. Falls back to
 * the pure-TS `computeBundleResiduals` when the engine isn't ready.
 */
export function computeBundleResidualsRouted(problem: BundleProblem): readonly BundleResidual[] {
  if (!isReconstructionEngineReady()) return computeBundleResiduals(problem);

  const cameraMap = new Map(problem.cameras.map((camera) => [camera.id, camera]));
  const landmarkMap = new Map(problem.landmarks.map((landmark) => [landmark.id, landmark]));
  const results: BundleResidual[] = new Array(problem.observations.length);
  const inputs: EngineObservationLinearizeInput[] = [];
  const positions: number[] = [];
  const resolvedIds: { landmarkId: string; cameraId: string }[] = [];

  problem.observations.forEach((observation, i) => {
    const camera = cameraMap.get(observation.cameraId);
    const landmark = landmarkMap.get(observation.landmarkId);
    if (!camera || !landmark) {
      results[i] = { landmarkId: observation.landmarkId, cameraId: observation.cameraId, residualX: 0, residualY: 0, valid: false };
      return;
    }
    inputs.push({
      intrinsics: camera.intrinsics,
      distortion: camera.distortion,
      cameraPose: camera.pose,
      cameraFixed: camera.fixed,
      landmark: [landmark.x, landmark.y, landmark.z],
      observed: [observation.observedX, observation.observedY],
      weight: 1, // computeBundleResiduals doesn't gate on weight — only linearizeObservation's `valid` does, via non-finiteness/projection failure
    });
    positions.push(i);
    resolvedIds.push({ landmarkId: landmark.id, cameraId: camera.id });
  });

  const linearized = engineLinearizeObservations(inputs);
  linearized.forEach((result, index) => {
    const i = positions[index]!;
    results[i] = {
      landmarkId: resolvedIds[index]!.landmarkId,
      cameraId: resolvedIds[index]!.cameraId,
      residualX: result.residual[0],
      residualY: result.residual[1],
      valid: result.valid,
    };
  });
  return results;
}

function projectWorldPoint(landmark: Landmark, camera: CameraBlock): readonly [number, number] | undefined {
  // camera.pose.translation is the camera's world-space CENTER (see
  // reprojection.ts's projectPoint for the full explanation) — subtract it
  // before rotating into camera space, don't add it after.
  const rotation = camera.pose.rotation;
  const center = camera.pose.translation;
  const lx = landmark.x - center[0]!, ly = landmark.y - center[1]!, lz = landmark.z - center[2]!;
  const x = rotation[0]! * lx + rotation[1]! * ly + rotation[2]! * lz;
  const y = rotation[3]! * lx + rotation[4]! * ly + rotation[5]! * lz;
  const z = rotation[6]! * lx + rotation[7]! * ly + rotation[8]! * lz;
  return projectDistortedPoint([x, y, z], camera.intrinsics, camera.distortion);
}
