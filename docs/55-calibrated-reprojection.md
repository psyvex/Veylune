# 55. Calibrated Reprojection

The reconstruction stack now has a shared calibrated camera projection primitive.

It transforms a world/local-map point through a camera pose, rejects non-finite or behind-camera points, and projects valid points with focal lengths and principal point.

Reprojection error is measured in pixels against an observed feature location.

## Why this comes before bundle adjustment

A numerical optimizer needs one authoritative projection/error function. Without it, pose and landmark optimization can silently optimize the wrong geometry.

The future optimizer should use this projection path (extended with the camera's actual distortion model) for every residual and Jacobian.

## Production gate

Before enabling optimization on live scans, add:

- distortion-aware projection
- finite-difference or analytic Jacobian tests
- synthetic known-pose reprojection tests
- positive-depth/cheirality tests
- residual regression thresholds
- performance benchmarks on target browsers

The current primitive intentionally has no distortion parameters; it is the calibrated pinhole foundation only.
