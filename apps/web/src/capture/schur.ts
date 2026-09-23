export interface SchurSystem {
  readonly cameraSize: number;
  readonly landmarkSize: number;
  readonly cameraHessian: Float64Array;
  readonly cameraGradient: Float64Array;
  readonly landmarkHessian: Float64Array;
  readonly landmarkGradient: Float64Array;
}

export interface SchurResult {
  readonly status: "insufficient" | "singular";
  readonly cameraStep: Float64Array;
}

export function prepareSchurSystem(system: SchurSystem): SchurResult {
  if (system.cameraSize === 0 || system.landmarkSize === 0) return { status: "insufficient", cameraStep: new Float64Array(system.cameraSize) };
  const step = new Float64Array(system.cameraSize);
  for (let i = 0; i < system.cameraSize; i += 1) {
    const diagonal = system.cameraHessian[i * system.cameraSize + i];
    if (!Number.isFinite(diagonal) || Math.abs(diagonal) < 1e-12) return { status: "singular", cameraStep: new Float64Array(system.cameraSize) };
    step[i] = -system.cameraGradient[i]! / diagonal!;
  }
  return { status: "singular", cameraStep: step };
}
