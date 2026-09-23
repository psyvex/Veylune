# 60. SE(3) and Schur Solver Boundary

The bundle-adjustment stack now has two important numerical boundaries.

## SE(3) camera increments

Camera updates use a 3-vector rotation increment mapped through the SO(3) exponential and a 3-vector translation increment. This avoids directly optimizing a nine-element rotation matrix and preserves the manifold structure of rotations.

## Schur complement

Bundle adjustment has a natural block structure: camera parameters and landmark parameters. The Schur complement should eliminate landmark blocks and solve the reduced camera system before back-substitution.

The current implementation only establishes guarded system preparation and diagonal-step behavior. It deliberately reports a non-solved status rather than pretending that a diagonal approximation is a valid Schur solve.

## Production gate

The complete solver still needs:

- full block `A`, `B`, and `C` assembly from observation Jacobians
- damped Schur complement `A - B C⁻¹ Bᵀ`
- stable factorization (QR/Cholesky/LDLT as appropriate)
- landmark back-substitution
- SE(3) retraction
- robust-loss reweighting per iteration
- rank/singularity detection
- trust-region or LM acceptance/rejection
- atomic map commit

Until these are implemented and validated on synthetic fixtures, live-map optimization remains disabled.
