import type { SchurBlocks, SchurReducedSystem } from "./schur-blocks";

export interface BundleStep {
  readonly camera: Float64Array;
  readonly landmarks: Float64Array;
}

export function backSubstituteLandmarks(blocks: SchurBlocks, reduced: SchurReducedSystem, cameraStep: Float64Array): BundleStep | undefined {
  if (cameraStep.length !== blocks.camera.rows) return undefined;
  const landmarks = new Float64Array(blocks.landmark.rows);
  for (let offset = 0; offset < blocks.landmark.rows; offset += 3) {
    const inverse = reduced.landmarkInverses[offset / 3];
    if (!inverse) return undefined;
    const rhs = new Float64Array(3);
    for (let local = 0; local < 3; local += 1) {
      let value = blocks.landmarkGradient[offset + local]!;
      for (let camera = 0; camera < blocks.camera.rows; camera += 1) value += blocks.cameraLandmark.values[camera * blocks.landmark.columns + offset + local]! * cameraStep[camera]!;
      rhs[local] = -value;
    }
    const solved = multiply3(inverse, rhs);
    landmarks.set(solved, offset);
  }
  return { camera: cameraStep, landmarks };
}

function multiply3(matrix: Float64Array, vector: Float64Array): Float64Array {
  return new Float64Array([
    matrix[0]! * vector[0]! + matrix[1]! * vector[1]! + matrix[2]! * vector[2]!,
    matrix[3]! * vector[0]! + matrix[4]! * vector[1]! + matrix[5]! * vector[2]!,
    matrix[6]! * vector[0]! + matrix[7]! * vector[1]! + matrix[8]! * vector[2]!,
  ]);
}
