export type ResidualFunction = (parameters: readonly number[]) => readonly number[];

export interface JacobianOptions {
  readonly epsilon: number;
}

export interface JacobianResult {
  readonly rows: number;
  readonly columns: number;
  readonly values: Float64Array;
}

export function finiteDifferenceJacobian(
  residual: ResidualFunction,
  parameters: readonly number[],
  options: JacobianOptions = { epsilon: 1e-6 },
): JacobianResult {
  if (!Number.isFinite(options.epsilon) || options.epsilon <= 0) throw new Error("Jacobian epsilon must be positive.");
  const base = residual(parameters);
  const rows = base.length;
  const columns = parameters.length;
  const values = new Float64Array(rows * columns);

  for (let column = 0; column < columns; column += 1) {
    const plus = [...parameters];
    const minus = [...parameters];
    plus[column] += options.epsilon;
    minus[column] -= options.epsilon;
    const plusResidual = residual(plus);
    const minusResidual = residual(minus);
    if (plusResidual.length !== rows || minusResidual.length !== rows) throw new Error("Residual dimension changed during Jacobian evaluation.");
    for (let row = 0; row < rows; row += 1) {
      const derivative = (plusResidual[row]! - minusResidual[row]!) / (2 * options.epsilon);
      if (!Number.isFinite(derivative)) throw new Error("Non-finite Jacobian derivative.");
      values[row * columns + column] = derivative;
    }
  }
  return { rows, columns, values };
}
