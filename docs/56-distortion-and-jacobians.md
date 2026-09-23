# 56. Distortion and Jacobian Infrastructure

The reconstruction stack now has two numerical primitives needed by a real optimizer.

## Camera distortion

A radial-tangential distortion model is available with `k1`, `k2`, `k3`, `p1`, and `p2`. The zero-distortion configuration preserves the calibrated pinhole model.

The distortion implementation operates in normalized camera coordinates before applying focal length and principal point.

## Jacobians

The optimizer boundary now supports central finite-difference Jacobians with explicit dimensional and finite-value checks. This provides a deterministic reference implementation for validating future analytic or automatic-differentiation Jacobians.

Finite differences are intentionally a correctness/reference path rather than the final realtime implementation; they can be too expensive for large parameter blocks.

## Production gate

Before enabling nonlinear optimization in realtime:

- compare analytic/AD Jacobians against finite-difference reference values
- test distortion against known calibration fixtures
- validate residual continuity around zero and near image boundaries
- reject invalid camera/landmark states
- benchmark Jacobian evaluation on target devices

Only after these checks should the actual robust least-squares solver be connected to live map updates.
