# 59. Bundle Parameterization and Sparse Systems

The bundle-adjustment layer now defines explicit parameter blocks and a sparse normal-equation accumulation boundary.

## Parameter blocks

The current layout contains:

- three translation parameters for each non-fixed camera
- three coordinates for each landmark
- a fixed reference camera excluded from the optimized vector

Rotation remains outside this first block layout because a production implementation must use a manifold-safe rotation parameterization rather than directly optimizing nine matrix entries.

## Sparse normal equations

The accumulator forms the upper-triangular `Jᵀ W J` structure and `Jᵀ W r` gradient from validated Jacobian rows. Zero terms are omitted so the representation can remain sparse.

## Production requirements

Before live use, the solver must add:

- SE(3) or Lie-algebra rotation increments
- camera/landmark observation sparsity rather than dense row materialization
- damping / trust-region updates
- sparse linear solving (Schur complement is preferred for bundle adjustment)
- robust loss weights derived from pixel residuals
- condition-number / rank-deficiency detection
- atomic state commit

The current code intentionally establishes the data model and numerical boundary without claiming that the full sparse solver is complete.
