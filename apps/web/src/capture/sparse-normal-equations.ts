export interface SparseTriplet {
  readonly row: number;
  readonly column: number;
  readonly value: number;
}

export interface SparseNormalSystem {
  readonly size: number;
  readonly entries: readonly SparseTriplet[];
  readonly gradient: Float64Array;
}

export function accumulateNormalEquations(
  jacobianRows: readonly Float64Array[],
  residuals: readonly number[],
  weights: readonly number[],
): SparseNormalSystem {
  if (jacobianRows.length !== residuals.length || residuals.length !== weights.length) {
    throw new Error("Normal-equation dimensions do not match.");
  }
  const size = jacobianRows[0]?.length ?? 0;
  const matrix = new Map<string, number>();
  const gradient = new Float64Array(size);

  for (let row = 0; row < jacobianRows.length; row += 1) {
    const values = jacobianRows[row]!;
    if (values.length !== size || !Number.isFinite(residuals[row]!) || !Number.isFinite(weights[row]!)) {
      throw new Error("Invalid Jacobian row or residual.");
    }
    const weight = Math.max(0, weights[row]!);
    for (let i = 0; i < size; i += 1) {
      const ji = values[i]!;
      if (!Number.isFinite(ji)) throw new Error("Non-finite Jacobian value.");
      gradient[i] += weight * ji * residuals[row]!;
      if (ji === 0) continue;
      for (let j = i; j < size; j += 1) {
        const jj = values[j]!;
        if (jj === 0) continue;
        const key = `${i}:${j}`;
        matrix.set(key, (matrix.get(key) ?? 0) + weight * ji * jj);
      }
    }
  }

  const entries: SparseTriplet[] = [];
  for (const [key, value] of matrix) {
    const [row, column] = key.split(":").map(Number);
    entries.push({ row, column, value });
  }
  return { size, entries, gradient };
}
