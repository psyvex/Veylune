# 47. Temporal Pose Filtering

Veylune now has a confidence-aware temporal filter for accepted pose samples.

## Behavior

The filter keeps a stable state, estimates velocity from accepted samples, and blends new observations toward a short-term prediction. Confidence controls the blend factor: weak observations influence the state less than strong observations.

Invalid timestamps and large time gaps are rejected rather than producing unbounded velocity estimates.

## Production boundary

This is a temporal stabilization layer, not a replacement for a probabilistic visual-inertial estimator or a full SLAM back end. It should run only after geometric verification and pose acceptance gates.

Future integration can replace this implementation with an EKF/UKF or factor-graph estimator when IMU, depth or multi-view constraints are available.

## Failure behavior

When no valid update is available, callers should retain the last stable state. Tracking loss should be represented explicitly so the UI can request reacquisition instead of silently extrapolating indefinitely.
