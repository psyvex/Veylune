# 44. Geometric Verification

The feature layer now has a deterministic geometric verification boundary.

## Current behavior

Candidate correspondences are checked for valid coordinates and filtered against a robust median translation residual. This is deliberately a conservative pre-verification step, not a full projective geometry solver.

The result reports:

- verified inliers
- inlier ratio
- whether the correspondence set is currently sufficient
- bounded confidence

## Geometry selection

A real camera-motion estimator should select geometry based on scene and camera conditions:

- **Homography** is appropriate when image correspondence is dominated by a planar scene or camera rotation.
- **Essential-matrix geometry** is appropriate for calibrated cameras with sufficient scene depth variation and genuine camera translation.

A homography must not be interpreted as metric camera translation. An essential matrix also requires valid camera intrinsics and robust outlier rejection.

## Production gate

The current median-residual verifier must not be treated as final pose estimation. The next geometry implementation should add a numerically robust RANSAC/USAC-style estimator, degeneracy checks, reprojection error evaluation, and pose recovery with cheirality validation.

Only geometrically verified correspondences should update the existing pose/coverage state.
