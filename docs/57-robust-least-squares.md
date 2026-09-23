# 57. Robust Least-Squares Optimization

The reconstruction stack now has a bounded nonlinear least-squares boundary with a Huber robust loss.

## Safety properties

- finite residual validation
- explicit Jacobian dimensions
- bounded iterations
- bounded parameter steps
- configurable damping term
- robust residual weighting
- rejection when the candidate increases cost
- original parameters returned on rejection
- explicit convergence status

## Important limitation

The current solver is a small browser-safe optimization primitive, not yet a complete bundle-adjustment engine. Its parameter update is intentionally conservative. Production bundle adjustment still requires block-sparse normal equations or an equivalent solver, camera/landmark parameterization, gauge fixing, distortion-aware residuals, and analytic or automatic-differentiation Jacobians.

The solver should therefore be integrated first in deterministic synthetic fixtures and only later connected to live map updates.

## Atomic commit

Optimization results must be validated against the pre-optimization state before replacing the active map. A rejected result must never partially mutate live reconstruction state.
