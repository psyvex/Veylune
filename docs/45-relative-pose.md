# 45. Relative Pose Estimation

The capture pipeline now has an explicit relative-pose contract between verified image correspondences and scan coverage.

## Important limitation

The current implementation is an architectural boundary and conservative fallback, not a production essential-matrix solver. It refuses to produce a metric pose from homography-only evidence and reports scale as unknown.

A genuine production estimator must perform:

1. normalized camera-coordinate construction
2. robust essential-matrix estimation with RANSAC/USAC-style sampling
3. degeneracy detection
4. reprojection/Sampson-error validation
5. essential-matrix decomposition into candidate rotations/translations
6. cheirality testing against triangulated points
7. temporal consistency checks
8. rejection when confidence or parallax is insufficient

## Scale

A monocular camera cannot recover absolute translation scale from two images alone. Veylune must therefore keep relative translation direction separate from metric scale until additional evidence exists, such as calibrated depth, known dimensions, depth sensors or multi-view reconstruction.

## Safety of downstream guidance

Pose updates should only be committed when the estimator returns `accepted`. Low-confidence, degenerate or insufficient observations must leave the previous stable pose intact rather than causing sudden UI movement.
