import type { BundleLinearization } from "./bundle-linearization";
import type { SchurBlocks } from "./schur-blocks";
import { HuberLoss } from "./robust-loss";

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
    const ci = cameraIndex.get(observation.cameraId);
    const li = landmarkIndex.get(observation.landmarkId);
    if (ci === undefined || li === undefined) continue;
    const cOffset = ci * 6;
    const lOffset = li * 3;

    const mahalanobisSquared = observation.weight * (observation.residual[0] ** 2 + observation.residual[1] ** 2);
    const weight = observation.weight * robustLoss.weight(mahalanobisSquared);
    for (let residual = 0; residual < 2; residual += 1) {
      const r = observation.residual[residual]!;
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
      for (let a = 0; a < 3; a += 1) {
        const ja = observation.landmarkJacobian[a * 2 + residual]! * weight;
        landmarkGradient[lOffset + a] += ja * r;
        for (let b = a; b < 3; b += 1) {
          const jb = observation.landmarkJacobian[b * 2 + residual]!;
          const value = ja * jb;
          landmark[(lOffset + a) * landmarkSize + lOffset + b] += value;
          if (a !== b) landmark[(lOffset + b) * landmarkSize + lOffset + a] += value;
        }
        for (let b = 0; b < 6; b += 1) {
          const jb = observation.cameraJacobian[b * 2 + residual]!;
          cameraLandmark[(cOffset + b) * landmarkSize + lOffset + a] += jb * ja;
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
