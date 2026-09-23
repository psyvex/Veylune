export interface BlockMatrix {
  readonly rows: number;
  readonly columns: number;
  readonly values: Float64Array;
}

export interface SchurBlocks {
  readonly camera: BlockMatrix;
  readonly cameraLandmark: BlockMatrix;
  readonly landmark: BlockMatrix;
  readonly cameraGradient: Float64Array;
  readonly landmarkGradient: Float64Array;
}

export interface SchurReducedSystem {
  readonly hessian: BlockMatrix;
  readonly gradient: Float64Array;
}

export function buildSchurReducedSystem(blocks: SchurBlocks, damping = 1e-6): SchurReducedSystem | undefined {
  if (damping <= 0 || !Number.isFinite(damping)) throw new Error("Damping must be positive.");
  if (blocks.camera.rows !== blocks.camera.columns || blocks.landmark.rows !== blocks.landmark.columns) return undefined;
  if (blocks.cameraLandmark.rows !== blocks.camera.rows || blocks.cameraLandmark.columns !== blocks.landmark.rows) return undefined;

  const cameraSize = blocks.camera.rows;
  const landmarkSize = blocks.landmark.rows;
  const reduced = new Float64Array(blocks.camera.values);
  const gradient = new Float64Array(blocks.cameraGradient);

  for (let i = 0; i < cameraSize; i += 1) reduced[i * cameraSize + i] += damping;

  for (let landmark = 0; landmark < landmarkSize; landmark += 1) {
    const c = blocks.landmark.values[landmark * landmarkSize + landmark]! + damping;
    if (!Number.isFinite(c) || Math.abs(c) < 1e-12) return undefined;
    const invC = 1 / c;

    for (let i = 0; i < cameraSize; i += 1) {
      const bi = blocks.cameraLandmark.values[i * landmarkSize + landmark]!;
      if (!Number.isFinite(bi)) return undefined;
      gradient[i] -= bi * invC * blocks.landmarkGradient[landmark]!;
      for (let j = i; j < cameraSize; j += 1) {
        const bj = blocks.cameraLandmark.values[j * landmarkSize + landmark]!;
        if (!Number.isFinite(bj)) return undefined;
        const value = bi * invC * bj;
        reduced[i * cameraSize + j] -= value;
        if (i !== j) reduced[j * cameraSize + i] -= value;
      }
    }
  }

  return {
    hessian: { rows: cameraSize, columns: cameraSize, values: reduced },
    gradient,
  };
}
