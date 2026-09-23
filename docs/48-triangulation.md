# 48. Triangulation and Depth Validation

Veylune now has a bounded triangulation boundary for turning verified correspondences and relative camera poses into candidate 3D points.

## Validation

Candidate points are rejected when:

- camera intrinsics are invalid
- correspondence indices are missing
- disparity is too small for stable depth
- baseline is unavailable
- coordinates are non-finite
- depth is not positive
- reprojection error exceeds the configured threshold

The result exposes the accepted points and median reprojection error.

## Important production limitation

This implementation is a conservative depth/reprojection boundary, not a complete bundle-adjustment or SLAM solver. A production reconstruction backend still needs:

- calibrated camera models and distortion handling
- proper projection matrices
- cheirality checks in both camera frames
- robust multi-view triangulation
- keyframe selection
- landmark track management
- scale handling
- local bundle adjustment
- loop-closure/relocalization strategy

The current scan pipeline must treat candidate points as provisional until those constraints are satisfied.

## Next step

Build the keyframe and landmark-map layer around validated tracks, while keeping all reconstruction data local by default.
