import type { BundleProblem, CameraBlock } from "./bundle-problem";
import type { Landmark } from "./map";
import { projectDistortedPointWithJacobian } from "./distortion";

export interface ObservationLinearization {
  readonly cameraId: string;
  readonly landmarkId: string;
  readonly residual: readonly [number, number];
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
    observations.push(linearizeObservation(camera, landmark, observation.observedX, observation.observedY));
  }
  return { observations, cameraIds, landmarkIds };
}

function linearizeObservation(camera: CameraBlock, landmark: Landmark, observedX: number, observedY: number): ObservationLinearization {
  const r = camera.pose.rotation;
  const t = camera.pose.translation;
  const x = r[0]! * landmark.x + r[1]! * landmark.y + r[2]! * landmark.z + t[0]!;
  const y = r[3]! * landmark.x + r[4]! * landmark.y + r[5]! * landmark.z + t[1]!;
  const z = r[6]! * landmark.x + r[7]! * landmark.y + r[8]! * landmark.z + t[2]!;
  const projected = projectDistortedPointWithJacobian([x, y, z], camera.intrinsics, camera.distortion);
  const cameraJacobian = new Float64Array(12);
  const landmarkJacobian = new Float64Array(6);
  if (!projected) return { cameraId: camera.id, landmarkId: landmark.id, residual: [0, 0], cameraJacobian, landmarkJacobian, valid: false };

  const j = projected.jacobian;
  // A left rotation increment changes the camera point by omega x q = -[q]x omega.
  const rotationDerivative = [0, z, -y, -z, 0, x, y, -x, 0];
  for (let row = 0; row < 2; row += 1) {
    const rowOffset = row * 3;
    for (let column = 0; column < 3; column += 1) {
      if (!camera.fixed) {
        cameraJacobian[column * 2 + row] = j[rowOffset]! * rotationDerivative[column]!
          + j[rowOffset + 1]! * rotationDerivative[3 + column]!
          + j[rowOffset + 2]! * rotationDerivative[6 + column]!;
        cameraJacobian[(3 + column) * 2 + row] = j[rowOffset + column]!;
      }
      landmarkJacobian[column * 2 + row] = j[rowOffset]! * r[column]!
        + j[rowOffset + 1]! * r[3 + column]!
        + j[rowOffset + 2]! * r[6 + column]!;
    }
  }
  const residual: readonly [number, number] = [projected.pixel[0] - observedX, projected.pixel[1] - observedY];
  const valid = [...residual, ...cameraJacobian, ...landmarkJacobian].every(Number.isFinite);
  return { cameraId: camera.id, landmarkId: landmark.id, residual, cameraJacobian, landmarkJacobian, valid };
}
