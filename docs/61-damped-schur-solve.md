# 61. Damped Schur Reduction and Linear Solve

The bundle-adjustment numerical path now contains a damped Schur reduction, a guarded positive-definite solve, and LM gain-ratio step acceptance.

## Reduction

For undamped camera block `A`, camera-landmark block `B`, and landmark block `C`, the reduced system follows the damped form:

`S = A + λI - B(C + λI)⁻¹Bᵀ`

and the corresponding reduced gradient is formed before solving the camera step.

Diagonal damping is applied once in the Schur solve. The optimizer compares actual robust-cost reduction with the reduction predicted by the undamped normal system, rejects non-positive gain ratios, and adjusts damping with the LM gain-ratio rule. The current implementation inverts each independent 3x3 landmark block.

## Linear solve

The reduced camera system is solved with a guarded Cholesky factorization. Non-positive pivots, non-finite values, dimension mismatches, and invalid systems are rejected.

## Still required before broad live rollout

- recorded-scene and device-level validation
- rank and gauge diagnostics for weakly constrained geometry
- performance profiling on representative mobile devices

The optimizer must remain fail-closed until those pieces are integrated and validated.
