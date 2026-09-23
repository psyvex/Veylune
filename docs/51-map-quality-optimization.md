# 51. Map Quality and Optimization

The reconstruction layer now has explicit quality scoring, pruning policy, and a bundle-adjustment boundary.

## Landmark quality

Landmarks are scored from reprojection error and observation count. Poorly observed or high-error landmarks can be pruned before they contaminate later optimization.

The score is a triage signal, not a probabilistic covariance estimate.

## Bundle adjustment

The repository now defines the input boundary for local bundle adjustment: landmarks plus camera observations. The current implementation only validates whether enough data exists and deliberately does not pretend to optimize geometry.

A production optimizer must use a numerically robust nonlinear least-squares implementation with:

- proper camera projection and distortion
- robust loss functions
- fixed/gauge-constrained reference pose
- landmark and pose parameter blocks
- convergence and divergence checks
- bounded iteration/time budgets
- cancellation support
- before/after reprojection metrics

## Map hygiene

Optimization should operate on a bounded local window rather than an unbounded browser-memory map. Pruning should occur before optimization and failed optimization must leave the last valid map state untouched.

All quality and optimization work remains local to the active capture session unless the user explicitly exports project data.
