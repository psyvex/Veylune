import type { ObservationLinearization, BundleLinearization } from "./bundle-linearization";
import type { SchurBlocks } from "./schur-blocks";
import type { RobustLoss } from "./robust-loss";

export interface BundleBlockAssembly extends SchurBlocks {
  readonly cameraIndex: ReadonlyMap<string, number>;
  readonly landmarkIndex: ReadonlyMap<string, number>;
}

export function assembleBundleBlocks(linearization: BundleLinearization, loss: RobustLoss): BundleBlockAssembly {
  const cameraIndex = new Map(linearization.cameraIds.map((id, index) => [id, index]));
  const landmarkIndex = new Map(linearization.landmarkIds.map((id, index) => [id, index]));
  const cameraSize = linearization.cameraIds.length * 6;
  const landmarkSize = linearization.landmarkIds.length * 3;
  const camera = new Float64Array(cameraSize * cameraSize);
  const cameraLandmark = new Float64Array(cameraSize * landmarkSize);
  const landmark = new Float64Array(landmarkSize * landmarkSize);
  const cameraGradient = new Float64Array(cameraSize);
  const landmarkGradient = new Float64Array(landmarkSize);

  for (const observation of linearization.observations) {
    if (!observation.valid) continue;
    const cameraBlock = cameraIndex.get(observation.cameraId);
    const landmarkBlock = landmarkIndex.get(observation.landmarkId);
    if (cameraBlock === undefined || landmarkBlock === undefined) continue;
    const weight = robustWeight(observation.residual, loss);
    accumulateObservation(camera, cameraLandmark, landmark, cameraGradient, landmarkGradient, cameraSize, landmarkSize, cameraBlock * 6, landmarkBlock * 3, observation, weight);
  }

  return {
    camera: { rows: cameraSize, columns: cameraSize, values: camera },
    cameraLandmark: { rows: cameraSize, columns: landmarkSize, values: cameraLandmark },
    landmark: { rows: landmarkSize, columns: landmarkSize, values: landmark },
    cameraGradient,
    landmarkGradient,
    cameraIndex,
    landmarkIndex,
  };
}

function robustWeight(residual: readonly [number, number], loss: RobustLoss): number {
  const squared = residual[0] * residual[0] + residual[1] * residual[1];
  return loss.weight(squared);
}

function accumulateObservation(
  camera: Float64Array,
  cameraLandmark: Float64Array,
  landmark: Float64Array,
  cameraGradient: Float64Array,
  landmarkGradient: Float64Array,
  cameraSize: number,
  landmarkSize: number,
  cameraOffset: number,
  landmarkOffset: number,
  observation: ObservationLinearization,
  weight: number,
): void {
  for (let row = 0; row < 2; row += 1) {
    const residual = observation.residual[row]!;
    for (let i = 0; i < 6; i += 1) {
      const ji = observation.cameraJacobian[row * 6 + i]!;
      cameraGradient[cameraOffset + i] += weight * ji * residual;
      for (let j = i; j < 6; j += 1) {
        const jj = observation.cameraJacobian[row * 6 + j]!;
        camera[(cameraOffset + i) * cameraSize + cameraOffset + j] += weight * ji * jj;
        if (i !== j) camera[(cameraOffset + j) * cameraSize + cameraOffset + i] += weight * ji * jj;
      }
      for (let j = 0; j < 3; j += 1) {
        const lj = observation.landmarkJacobian[row * 3 + j]!;
        cameraLandmark[(cameraOffset + i) * landmarkSize + landmarkOffset + j] += weight * ji * lj;
      }
    }
    for (let i = 0; i < 3; i += 1) {
      const li = observation.landmarkJacobian[row * 3 + i]!;
      landmarkGradient[landmarkOffset + i] += weight * li * residual;
      for (let j = i; j < 3; j += 1) {
        const lj = observation.landmarkJacobian[row * 3 + j]!;
        landmark[(landmarkOffset + i) * landmarkSize + landmarkOffset + j] += weight * li * lj;
        if (i !== j) landmark[(landmarkOffset + j) * landmarkSize + landmarkOffset + i] += weight * li * lj;
      }
    }
  }
}
