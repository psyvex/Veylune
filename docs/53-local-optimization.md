# 53. Local Optimization Boundary

Veylune now has an explicit bounded optimization boundary for the local map.

The optimizer validates the problem, computes a finite baseline error, applies a bounded iteration budget, and reports before/after error plus convergence status. Rejected optimization leaves the original landmarks untouched.

## Important limitation

This is **not yet a production bundle-adjustment solver**. It intentionally does not claim to solve camera pose, lens distortion, Jacobians, or nonlinear least squares. A production implementation must replace the placeholder step calculation with a numerically correct optimizer operating on camera and landmark parameter blocks.

Required production properties:

- analytic or automatically differentiated Jacobians
- robust loss functions
- calibrated camera projection and distortion
- gauge fixing / reference-pose constraints
- damping or trust-region control
- convergence and divergence criteria
- deterministic bounded compute
- cancellation support
- atomic commit only after validation
- regression fixtures with known camera/landmark geometry

The current boundary exists so that the optimizer can be replaced without changing the map lifecycle or failure semantics.
