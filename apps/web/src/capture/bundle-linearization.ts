import type { BundleProblem, CameraBlock, BundleResidual } from "./bundle-problem";
import type { Landmark } from "./map";
import { applySE3Increment, type Mat3 } from "./se3";
import { computeBundleResiduals } from "./bundle-problem";

export interface ObservationLinearization {
  readonly cameraId: string;
  readonly landmarkId: string;
  readonly residual: readonly [number, number];
  readonly cameraJacobian: Float64Array; // row-major 2 x 6
  readonly landmarkJacobian: Float64Array; // row-major 2 x 3
  readonly valid: boolean;
}

export interface BundleLinearization {
  readonly observations: readonly ObservationLinearization[];
  readonly cameraIds: readonly string[];
  readonly landmarkIds: readonly string[];
}

const DEFAULT_EPSILON = 1e-6;

export function linearizeBundle(problem: BundleProblem, epsilon = DEFAULT_EPSILON): BundleLinearization {
  if (!Number.isFinite(epsilon) || epsilon <= 0) throw new Error("Linearization epsilon must be positive.");
  const cameras = problem.cameras.filter((camera) => !camera.fixed);
  const cameraIds = cameras.map((camera) => camera.id);
  const landmarkIds = problem.landmarks.map((landmark) => landmark.id);
  const observations: ObservationLinearization[] = [];
  const cameraMap = new Map(problem.cameras.map((camera) => [camera.id, camera]));
  const landmarkMap = new Map(problem.landmarks.map((landmark) => [landmark.id, landmark]));

  for (const observation of problem.observations) {
    const camera = cameraMap.get(observation.cameraId);
    const landmark = landmarkMap.get(observation.landmarkId);
    if (!camera || !landmark) continue;
    const base = residualFor(problem, camera, landmark);
    if (!base) {
      observations.push({ cameraId: camera.id, landmarkId: landmark.id, residual: [0, 0], cameraJacobian: new Float64Array(12), landmarkJacobian: new Float64Array(6), valid: false });
      continue;
    }

    const cameraJacobian = new Float64Array(12);
    if (!camera.fixed) {
      for (let column = 0; column < 6; column += 1) {
        const plus = perturbCamera(camera, column, epsilon);
        const minus = perturbCamera(camera, column, -epsilon);
        const plusResidual = residualFor(problem, plus, landmark);
        const minusResidual = residualFor(problem, minus, landmark);
        if (!plusResidual || !minusResidual) continue;
        cameraJacobian[column] = (plusResidual[0] - minusResidual[0]) / (2 * epsilon);
        cameraJacobian[6 + column] = (plusResidual[1] - minusResidual[1]) / (2 * epsilon);
      }
    }

    const landmarkJacobian = new Float64Array(6);
    for (let column = 0; column < 3; column += 1) {
      const plus = perturbLandmark(landmark, column, epsilon);
      const minus = perturbLandmark(landmark, column, -epsilon);
      const plusResidual = residualFor(problem, camera, plus);
      const minusResidual = residualFor(problem, camera, minus);
      if (!plusResidual || !minusResidual) continue;
      landmarkJacobian[column] = (plusResidual[0] - minusResidual[0]) / (2 * epsilon);
      landmarkJacobian[3 + column] = (plusResidual[1] - minusResidual[1]) / (2 * epsilon);
    }

    const valid = [...base, ...cameraJacobian, ...landmarkJacobian].every(Number.isFinite);
    observations.push({ cameraId: camera.id, landmarkId: landmark.id, residual: base, cameraJacobian, landmarkJacobian, valid });
  }

  return { observations, cameraIds, landmarkIds };
}

function residualFor(problem: BundleProblem, camera: CameraBlock, landmark: Landmark): readonly [number, number] | undefined {
  const residual = computeBundleResiduals({ ...problem, cameras: problem.cameras.map((candidate) => candidate.id === camera.id ? camera : candidate), landmarks: problem.landmarks.map((candidate) => candidate.id === landmark.id ? landmark : candidate), observations: problem.observations.filter((observation) => observation.cameraId === camera.id && observation.landmarkId === landmark.id) });
  const first: BundleResidual | undefined = residual[0];
  return first?.valid ? [first.residualX, first.residualY] : undefined;
}

function perturbCamera(camera: CameraBlock, column: number, amount: number): CameraBlock {
  const rotation = camera.pose.rotation as Mat3;
  const increment = {
    rotation: [column === 0 ? amount : 0, column === 1 ? amount : 0, column === 2 ? amount : 0] as const,
    translation: [column === 3 ? amount : 0, column === 4 ? amount : 0, column === 5 ? amount : 0] as const,
  };
  const next = applySE3Increment(rotation, camera.pose.translation, increment);
  return { ...camera, pose: next };
}

function perturbLandmark(landmark: Landmark, column: number, amount: number): Landmark {
  const next = [landmark.x, landmark.y, landmark.z];
  next[column] += amount;
  return { ...landmark, x: next[0]!, y: next[1]!, z: next[2]! };
}
