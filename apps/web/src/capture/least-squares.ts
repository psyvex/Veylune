import type { RobustLoss } from "./robust-loss";

export interface LeastSquaresOptions {
  readonly maxIterations: number;
  readonly lambda: number;
  readonly convergenceEpsilon: number;
  readonly maxParameterStep: number;
}

export interface LeastSquaresProblem {
  readonly parameters: readonly number[];
  readonly residuals: (parameters: readonly number[]) => readonly number[];
  readonly jacobian: (parameters: readonly number[]) => { rows: number; columns: number; values: Float64Array };
  readonly loss: RobustLoss;
}

export interface LeastSquaresResult {
  readonly status: "converged" | "rejected" | "insufficient";
  readonly parameters: readonly number[];
  readonly initialCost: number;
  readonly finalCost: number;
  readonly iterations: number;
}

export function solveBoundedLeastSquares(
  problem: LeastSquaresProblem,
  options: LeastSquaresOptions = { maxIterations: 10, lambda: 1e-3, convergenceEpsilon: 1e-6, maxParameterStep: 0.1 },
): LeastSquaresResult {
  if (problem.parameters.length === 0 || options.maxIterations <= 0 || options.lambda <= 0 || options.maxParameterStep <= 0) {
    return { status: "insufficient", parameters: problem.parameters, initialCost: Infinity, finalCost: Infinity, iterations: 0 };
  }

  let parameters = [...problem.parameters];
  let residuals = problem.residuals(parameters);
  let cost = robustCost(residuals, problem.loss);
  if (!Number.isFinite(cost)) return { status: "rejected", parameters: problem.parameters, initialCost: Infinity, finalCost: Infinity, iterations: 0 };
  const initialCost = cost;

  for (let iteration = 0; iteration < options.maxIterations; iteration += 1) {
    const jacobian = problem.jacobian(parameters);
    if (jacobian.columns !== parameters.length || jacobian.rows !== residuals.length) {
      return { status: "rejected", parameters: problem.parameters, initialCost, finalCost: cost, iterations: iteration };
    }

    const gradient = new Float64Array(parameters.length);
    for (let row = 0; row < jacobian.rows; row += 1) {
      const weight = problem.loss.weight(residuals[row]! * residuals[row]!);
      for (let column = 0; column < jacobian.columns; column += 1) {
        gradient[column] += jacobian.values[row * jacobian.columns + column]! * residuals[row]! * weight;
      }
    }

    let maxStep = 0;
    for (let column = 0; column < parameters.length; column += 1) {
      const step = Math.max(-options.maxParameterStep, Math.min(options.maxParameterStep, -gradient[column]! / (options.lambda + 1)));
      parameters[column] += step;
      maxStep = Math.max(maxStep, Math.abs(step));
    }

    const nextResiduals = problem.residuals(parameters);
    const nextCost = robustCost(nextResiduals, problem.loss);
    if (!Number.isFinite(nextCost) || nextCost > cost) {
      return { status: "rejected", parameters: problem.parameters, initialCost, finalCost: cost, iterations: iteration + 1 };
    }
    residuals = nextResiduals;
    if (Math.abs(cost - nextCost) <= options.convergenceEpsilon || maxStep <= options.convergenceEpsilon) {
      return { status: "converged", parameters, initialCost, finalCost: nextCost, iterations: iteration + 1 };
    }
    cost = nextCost;
  }

  return { status: "converged", parameters, initialCost, finalCost: cost, iterations: options.maxIterations };
}

function robustCost(residuals: readonly number[], loss: RobustLoss): number {
  let total = 0;
  for (const residual of residuals) {
    if (!Number.isFinite(residual)) return Infinity;
    total += loss.rhoSquared(residual * residual);
  }
  return total;
}
