import type { BundleProblem, CameraBlock } from "./bundle-problem";
import type { Landmark } from "./map";
import { applySE3Increment, type Mat3 } from "./se3";
import { computeBundleResiduals } from "./bundle-problem";

export interface ObservationLinearization {
  readonly cameraId: string;
  readonly landmarkId: string;
  readonly residual: readonly [number, number];
  readonly cameraJacobian: Float64Array;
  readonly landmarkJacobian: Float64Array;
  readonly valid: boolean;
}

export interface BundleLinearization {
  readonly observations: readonly ObservationLinearization[];
  readonly cameraIds: readonly string[];
  readonly landmarkIds: readonly string[];
}

export interface LinearizationOptions {
  readonly epsilonRotation: number;
  readonly epsilonTranslation: number;
  readonly epsilonLandmark: number;
}

const DEFAULT_OPTIONS: LinearizationOptions = {
  epsilonRotation: 1e-6,
  epsilonTranslation: 1e-6,
  epsilonLandmark: 1e-6,
};

export function linearizeBundle(
  problem: BundleProblem,
  options: LinearizationOptions = DEFAULT_OPTIONS,
): BundleLinearization {
  const cameraIds = problem.cameras.filter((camera) => !camera.fixed).map((camera) => camera.id);
  const landmarkIds = problem.landmarks.map((landmark) => landmark.id);
  const base = computeBundleResiduals(problem);
  const observations: ObservationLinearization[] = [];

  for (let index = 0; index < problem.observations.length; index += 1) {
    const observation = problem.observations[index]!;
    const baseResidual = base[index]!;
    if (!baseResidual.valid) continue;

    const camera = problem.cameras.find((candidate) => candidate.id === observation.cameraId);
    const landmark = problem.landmarks.find((candidate) => candidate.id === observation.landmarkId);
    if (!camera || !landmark) continue;

    const cameraJacobian = new Float64Array(12);
    if (!camera.fixed) {
      for (let parameter = 0; parameter < 6; parameter += 1) {
        const perturbed = perturbCamera(problem, camera, parameter, parameter < 3 ? options.epsilonRotation : options.epsilonTranslation);
        const residual = computeBundleResiduals(perturbed).find((candidate) => candidate.cameraId === camera.id && candidate.landmarkId === landmark.id);
        if (!residual?.valid) continue;
        const epsilon = parameter < 3 ? options.epsilonRotation : options.epsilonTranslation;
        cameraJacobian[parameter * 2] = (residual.residualX - baseResidual.residualX) / epsilon;
        cameraJacobian[parameter * 2 + 1] = (residual.residualY - baseResidual.residualY) / epsilon;
      }
    }

    const landmarkJacobian = new Float64Array(6);
    for (let parameter = 0; parameter < 3; parameter += 1) {
      const perturbed = perturbLandmark(problem, landmark, parameter, options.epsilonLandmark);
      const residual = computeBundleResiduals(perturbed).find((candidate) => candidate.cameraId === camera.id && candidate.landmarkId === landmark.id);
      if (!residual?.valid) continue;
      landmarkJacobian[parameter * 2] = (residual.residualX - baseResidual.residualX) / options.epsilonLandmark;
      landmarkJacobian[parameter * 2 + 1] = (residual.residualY - baseResidual.residualY) / options.epsilonLandmark;
    }

    observations.push({
      cameraId: camera.id,
      landmarkId: landmark.id,
      residual: [baseResidual.residualX, baseResidual.residualY],
      cameraJacobian,
      landmarkJacobian,
      valid: true,
    });
  }

  return { observations, cameraIds, landmarkIds };
}

function perturbCamera(problem: BundleProblem, target: CameraBlock, parameter: number, epsilon: number): BundleProblem {
  const increment = parameter < 3
    ? { rotation: unit(parameter, epsilon), translation: [0, 0, 0] as const }
    : { rotation: [0, 0, 0] as const, translation: unit(parameter - 3, epsilon) };
  return {
    ...problem,
    cameras: problem.cameras.map((camera) => {
      if (camera.id !== target.id) return camera;
      const updated = applySE3Increment(camera.pose.rotation as Mat3, camera.pose.translation, increment);
      return { ...camera, pose: updated };
    }),
  };
}

function perturbLandmark(problem: BundleProblem, target: Landmark, parameter: number, epsilon: number): BundleProblem {
  return {
    ...problem,
    landmarks: problem.landmarks.map((landmark) => landmark.id === target.id
      ? { ...landmark, x: landmark.x + (parameter === 0 ? epsilon : 0), y: landmark.y + (parameter === 1 ? epsilon : 0), z: landmark.z + (parameter === 2 ? epsilon : 0) }
      : landmark),
  };
}

function unit(index: number, epsilon: number): readonly [number, number, number] {
  return index === 0 ? [epsilon, 0, 0] : index === 1 ? [0, epsilon, 0] : [0, 0, epsilon];
}
