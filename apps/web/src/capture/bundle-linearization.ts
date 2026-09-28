import type { BundleProblem, CameraBlock } from "./bundle-problem";
import type { Landmark } from "./map";
import { projectDistortedPointWithJacobian } from "./distortion";
import { engineLinearizeObservations, type EngineObservationLinearizeInput } from "../engine/index.js";
import { isReconstructionEngineReady } from "./reconstruction-engine-bootstrap.js";

export interface ObservationLinearization {
  readonly cameraId: string;
  readonly landmarkId: string;
  readonly residual: readonly [number, number];
  readonly weight: number;
  readonly cameraJacobian: Float64Array; // column-major 2 x 6
  readonly landmarkJacobian: Float64Array; // column-major 2 x 3
  readonly valid: boolean;
}

export interface BundleLinearization {
  readonly observations: readonly ObservationLinearization[];
  readonly cameraIds: readonly string[];
  readonly landmarkIds: readonly string[];
}

export function linearizeBundle(problem: BundleProblem): BundleLinearization {
  const cameraIds = problem.cameras.filter((camera) => !camera.fixed).map((camera) => camera.id);
  const landmarkIds = problem.landmarks.map((landmark) => landmark.id);
  const cameraMap = new Map(problem.cameras.map((camera) => [camera.id, camera]));
  const landmarkMap = new Map(problem.landmarks.map((landmark) => [landmark.id, landmark]));
  const observations: ObservationLinearization[] = [];

  for (const observation of problem.observations) {
    const camera = cameraMap.get(observation.cameraId);
    const landmark = landmarkMap.get(observation.landmarkId);
    if (!camera || !landmark) continue;
    observations.push(linearizeObservation(camera, landmark, observation.observedX, observation.observedY, observation.weight ?? 1));
  }
  return { observations, cameraIds, landmarkIds };
}

/**
 * Routes `linearizeBundle`'s per-observation math to a single
 * `engineLinearizeObservations` call (ADR-013, Stage 1) — the
 * `camera`/`landmark` `Map` lookups and the id-attaching-to-result step
 * stay exactly as in `linearizeBundle` (problem-graph orchestration, not
 * math); only the batched linearization itself moves to WASM, in one call
 * for the whole resolved observation list instead of one call per
 * observation (see `linearize_observations`'s Rust module doc). Falls back
 * to the pure-TS `linearizeBundle` when the engine isn't ready.
 */
export function linearizeBundleRouted(problem: BundleProblem): BundleLinearization {
  if (!isReconstructionEngineReady()) return linearizeBundle(problem);

  const cameraIds = problem.cameras.filter((camera) => !camera.fixed).map((camera) => camera.id);
  const landmarkIds = problem.landmarks.map((landmark) => landmark.id);
  const cameraMap = new Map(problem.cameras.map((camera) => [camera.id, camera]));
  const landmarkMap = new Map(problem.landmarks.map((landmark) => [landmark.id, landmark]));

  const resolved: { camera: CameraBlock; landmark: Landmark }[] = [];
  const inputs: EngineObservationLinearizeInput[] = [];
  for (const observation of problem.observations) {
    const camera = cameraMap.get(observation.cameraId);
    const landmark = landmarkMap.get(observation.landmarkId);
    if (!camera || !landmark) continue;
    resolved.push({ camera, landmark });
    inputs.push({
      intrinsics: camera.intrinsics,
      distortion: camera.distortion,
      cameraPose: camera.pose,
      cameraFixed: camera.fixed,
      landmark: [landmark.x, landmark.y, landmark.z],
      observed: [observation.observedX, observation.observedY],
      weight: observation.weight ?? 1,
    });
  }

  const results = engineLinearizeObservations(inputs);
  const observations: ObservationLinearization[] = results.map((result, i) => ({
    cameraId: resolved[i]!.camera.id,
    landmarkId: resolved[i]!.landmark.id,
    residual: result.residual,
    weight: result.weight,
    cameraJacobian: result.cameraJacobian,
    landmarkJacobian: result.landmarkJacobian,
    valid: result.valid,
  }));
  return { observations, cameraIds, landmarkIds };
}

function linearizeObservation(camera: CameraBlock, landmark: Landmark, observedX: number, observedY: number, weight: number): ObservationLinearization {
  // camera.pose.translation is the camera's world-space CENTER (see
  // reprojection.ts's projectPoint for the full explanation): q = R*(P - C).
  const r = camera.pose.rotation;
  const c = camera.pose.translation;
  const lx = landmark.x - c[0]!, ly = landmark.y - c[1]!, lz = landmark.z - c[2]!;
  const x = r[0]! * lx + r[1]! * ly + r[2]! * lz;
  const y = r[3]! * lx + r[4]! * ly + r[5]! * lz;
  const z = r[6]! * lx + r[7]! * ly + r[8]! * lz;
  const projected = projectDistortedPointWithJacobian([x, y, z], camera.intrinsics, camera.distortion);
  const cameraJacobian = new Float64Array(12);
  const landmarkJacobian = new Float64Array(6);
  if (!projected) return { cameraId: camera.id, landmarkId: landmark.id, residual: [0, 0], weight, cameraJacobian, landmarkJacobian, valid: false };

  const j = projected.jacobian;
  // A left rotation increment changes the camera point by omega x q = -[q]x omega.
  // (Unaffected by the center-vs-translation fix above: this only depends on
  // q = x,y,z, which is now computed correctly.)
  const rotationDerivative = [0, z, -y, -z, 0, x, y, -x, 0];
  for (let row = 0; row < 2; row += 1) {
    const rowOffset = row * 3;
    for (let column = 0; column < 3; column += 1) {
      if (!camera.fixed) {
        cameraJacobian[column * 2 + row] = j[rowOffset]! * rotationDerivative[column]!
          + j[rowOffset + 1]! * rotationDerivative[3 + column]!
          + j[rowOffset + 2]! * rotationDerivative[6 + column]!;
        // d(q)/d(center) = -R (q = R*(P - C)), the negative of the
        // landmark block below (d(q)/d(P) = R) — not the identity a
        // standard-t parameterization would give.
        cameraJacobian[(3 + column) * 2 + row] = -(j[rowOffset]! * r[column]!
          + j[rowOffset + 1]! * r[3 + column]!
          + j[rowOffset + 2]! * r[6 + column]!);
      }
      landmarkJacobian[column * 2 + row] = j[rowOffset]! * r[column]!
        + j[rowOffset + 1]! * r[3 + column]!
        + j[rowOffset + 2]! * r[6 + column]!;
    }
  }
  const residual: readonly [number, number] = [projected.pixel[0] - observedX, projected.pixel[1] - observedY];
  const valid = Number.isFinite(weight) && weight > 0 && [...residual, ...cameraJacobian, ...landmarkJacobian].every(Number.isFinite);
  return { cameraId: camera.id, landmarkId: landmark.id, residual, weight, cameraJacobian, landmarkJacobian, valid };
}
