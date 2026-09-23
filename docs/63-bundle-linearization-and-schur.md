# 62. Production Bundle Linearization

This batch moves bundle adjustment from solver infrastructure toward a real coupled local solve.

## Observation linearization

Each valid observation now produces:

- a 2D pixel residual
- a 2×6 camera Jacobian for the non-fixed camera
- a 2×3 landmark Jacobian

The reference implementation uses central finite differences around the existing calibrated/distortion-aware projection. This keeps the numerical contract explicit while analytic/automatic-differentiation Jacobians are validated.

## Block assembly

Observation Jacobians are accumulated into:

- camera-camera `A`
- camera-landmark `B`
- landmark-landmark `C`
- camera gradient
- landmark gradient

Huber weights are applied at the observation level.

## Schur reduction

Landmark blocks are now treated as full 3×3 blocks rather than independent scalar diagonals. Each block is damped and inverted before contributing to the reduced camera system. Landmark increments can then be recovered by block back-substitution.

## Numerical safety

Invalid observations are skipped from the system. Singular 3×3 landmark blocks reject the reduction. All matrix dimensions and numerical outputs are validated before a result is eligible for application.

## Remaining production gates

- replace finite-difference Jacobians with validated analytic/AD Jacobians
- use a sparse block representation instead of dense global arrays for large windows
- solve reduced systems with a production sparse factorization
- implement full LM gain-ratio acceptance and adaptive damping
- apply SE(3) and landmark updates atomically to a copied map
- benchmark worker/WASM execution and cancellation
- add recorded-scene regression fixtures
