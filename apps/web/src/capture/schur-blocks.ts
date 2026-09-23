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
  readonly landmarkInverses: readonly Float64Array[];
}

export function buildSchurReducedSystem(blocks: SchurBlocks, damping = 1e-6): SchurReducedSystem | undefined {
  if (damping <= 0 || !Number.isFinite(damping)) throw new Error("Damping must be positive.");
  const cameraSize = blocks.camera.rows;
  const landmarkSize = blocks.landmark.rows;
  if (cameraSize === 0 || landmarkSize === 0 || cameraSize % 6 !== 0 || landmarkSize % 3 !== 0) return undefined;
  if (blocks.camera.columns !== cameraSize || blocks.landmark.columns !== landmarkSize) return undefined;
  if (blocks.cameraLandmark.rows !== cameraSize || blocks.cameraLandmark.columns !== landmarkSize) return undefined;
  if (blocks.cameraGradient.length !== cameraSize || blocks.landmarkGradient.length !== landmarkSize) return undefined;

  const reduced = new Float64Array(blocks.camera.values);
  const gradient = new Float64Array(blocks.cameraGradient);
  const landmarkInverses: Float64Array[] = [];
  for (let landmarkOffset = 0; landmarkOffset < landmarkSize; landmarkOffset += 3) {
    const c = new Float64Array(9);
    for (let r = 0; r < 3; r += 1) for (let col = 0; col < 3; col += 1) {
      c[r * 3 + col] = blocks.landmark.values[(landmarkOffset + r) * landmarkSize + landmarkOffset + col]! + (r === col ? damping : 0);
    }
    const inverse = invert3(c);
    if (!inverse) return undefined;
    landmarkInverses.push(inverse);

    const invGradient = multiply3x3Vec(inverse, [
      blocks.landmarkGradient[landmarkOffset]!,
      blocks.landmarkGradient[landmarkOffset + 1]!,
      blocks.landmarkGradient[landmarkOffset + 2]!,
    ]);
    for (let i = 0; i < cameraSize; i += 1) {
      const b = blockRow(blocks.cameraLandmark, i, landmarkOffset);
      gradient[i] -= dot3(b, invGradient);
      for (let j = 0; j < cameraSize; j += 1) {
        const bj = blockRow(blocks.cameraLandmark, j, landmarkOffset);
        reduced[i * cameraSize + j] -= quad3(b, inverse, bj);
      }
    }
  }

  for (let i = 0; i < cameraSize; i += 1) reduced[i * cameraSize + i] += damping;
  return { hessian: { rows: cameraSize, columns: cameraSize, values: reduced }, gradient, landmarkInverses };
}

function blockRow(matrix: BlockMatrix, row: number, landmarkOffset: number): readonly [number, number, number] {
  return [matrix.values[row * matrix.columns + landmarkOffset]!, matrix.values[row * matrix.columns + landmarkOffset + 1]!, matrix.values[row * matrix.columns + landmarkOffset + 2]!];
}
function dot3(a: readonly number[], b: readonly number[]): number { return a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!; }
function quad3(a: readonly number[], inverse: Float64Array, b: readonly number[]): number { return dot3(a, multiply3x3Vec(inverse, b)); }
function multiply3x3Vec(m: Float64Array, v: readonly number[]): readonly [number, number, number] {
  return [m[0]! * v[0]! + m[1]! * v[1]! + m[2]! * v[2]!, m[3]! * v[0]! + m[4]! * v[1]! + m[5]! * v[2]!, m[6]! * v[0]! + m[7]! * v[1]! + m[8]! * v[2]!];
}
function invert3(m: Float64Array): Float64Array | undefined {
  const a = m[0]!, b = m[1]!, c = m[2]!, d = m[3]!, e = m[4]!, f = m[5]!, g = m[6]!, h = m[7]!, i = m[8]!;
  const A = e * i - f * h, B = c * h - b * i, C = b * f - c * e;
  const D = f * g - d * i, E = a * i - c * g, F = c * d - a * f;
  const G = d * h - e * g, H = b * g - a * h, I = a * e - b * d;
  const determinant = a * A + b * D + c * G;
  if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-12) return undefined;
  const inv = new Float64Array([A, B, C, D, E, F, G, H, I].map((value) => value / determinant));
  return inv.every(Number.isFinite) ? inv : undefined;
}
