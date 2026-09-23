# 46. Pose Update Gates

Pose estimation is now separated from pose commitment.

A candidate relative pose must satisfy all of the following before it can update scan state:

- estimator status is `accepted`
- a pose exists
- minimum verified inlier count is reached
- confidence threshold is reached
- measured median parallax is sufficient
- parallax is finite and numerically valid

## Why parallax matters

Large numbers of nearly stationary or rotation-only correspondences can produce visually plausible tracking while providing little translational information. A parallax gate prevents weak observations from being promoted to a camera-motion update.

## Stability behavior

When a candidate fails a gate, downstream state should retain the last stable pose and expose a recoverable tracking state rather than applying a low-confidence jump.

## Current scope

These gates are conservative application-level guards. They do not replace a numerically robust essential-matrix solver, RANSAC/USAC, triangulation, cheirality checks, or temporal filtering. Those remain prerequisites for production metric reconstruction.
