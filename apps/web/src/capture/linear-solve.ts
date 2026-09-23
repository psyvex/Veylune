export interface DenseLinearSystem {
  readonly size: number;
  readonly matrix: Float64Array;
  readonly rhs: Float64Array;
}

export function solvePositiveDefinite(system: DenseLinearSystem): Float64Array | undefined {
  const n = system.size;
  if (n <= 0 || system.matrix.length !== n * n || system.rhs.length !== n) return undefined;
  const l = new Float64Array(n * n);

  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j <= i; j += 1) {
      let sum = system.matrix[i * n + j]!;
      for (let k = 0; k < j; k += 1) sum -= l[i * n + k]! * l[j * n + k]!;
      if (i === j) {
        if (!Number.isFinite(sum) || sum <= 1e-12) return undefined;
        l[i * n + j] = Math.sqrt(sum);
      } else {
        const pivot = l[j * n + j]!;
        if (!Number.isFinite(pivot) || pivot === 0) return undefined;
        l[i * n + j] = sum / pivot;
      }
    }
  }

  const y = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    let sum = system.rhs[i]!;
    for (let k = 0; k < i; k += 1) sum -= l[i * n + k]! * y[k]!;
    y[i] = sum / l[i * n + i]!;
  }

  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i -= 1) {
    let sum = y[i]!;
    for (let k = i + 1; k < n; k += 1) sum -= l[k * n + i]! * x[k]!;
    x[i] = sum / l[i * n + i]!;
  }
  return [...x].every(Number.isFinite) ? x : undefined;
}
