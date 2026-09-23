# 61. Damped Schur Reduction and Linear Solve

The bundle-adjustment numerical path now contains a real damped Schur reduction and a guarded positive-definite linear solve.

## Reduction

For camera block `A`, camera-landmark block `B`, and landmark block `C`, the reduced system follows the damped form:

`S = A + λI - B(C + λI)⁻¹Bᵀ`

and the corresponding reduced gradient is formed before solving the camera step.

The current implementation uses diagonal landmark inversion. This is intentionally conservative and is appropriate only as an intermediate boundary; production BA should exploit the full block-diagonal landmark structure produced by independent landmark observations.

## Linear solve

The reduced camera system is solved with a guarded Cholesky factorization. Non-positive pivots, non-finite values, dimension mismatches, and invalid systems are rejected.

## Still required before live BA

- true 6-DoF camera block Jacobians
- full landmark 3-DoF block Jacobians
- complete block-diagonal `C` inversion
- LM gain-ratio acceptance
- back-substitution for landmark updates
- SE(3) retraction of accepted camera steps
- robust-loss iteration
- synthetic accuracy tests
- atomic map commit

The optimizer must remain fail-closed until those pieces are integrated and validated.
