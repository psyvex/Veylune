# 58. Camera + Landmark Bundle Problem

The optimizer now has a concrete bundle-adjustment problem boundary connecting camera blocks, landmark blocks, and image observations.

## Residual model

Each valid observation produces two pixel residuals:

- projected X minus observed X
- projected Y minus observed Y

Projection uses camera pose, calibrated intrinsics, and radial-tangential distortion.

## Gauge fixing

At least one camera block must be fixed while optimizing a connected local window. Without a fixed reference, the reconstruction has an arbitrary global transform and the optimizer can move the entire solution without changing image error.

## Current scope

The residual builder is now real and distortion-aware, but camera/landmark parameter mutation and sparse solving are intentionally still separate. The next implementation must construct parameter blocks, generate Jacobians, solve the coupled system, and atomically apply only a validated result.

Invalid observations are explicitly marked rather than silently producing NaN residuals.
