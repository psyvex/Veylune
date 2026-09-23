# 62. Session-backed bundle optimization

Bundle adjustment now runs at the reconstruction-session boundary rather than against disconnected map and pose structures.

## Input boundary

A `ReconstructionSessionSnapshot` supplies:

- calibrated camera intrinsics and distortion
- keyframe camera poses and fixed gauge state
- landmark geometry
- 2D observations linking keyframes to landmarks

The session is converted into the existing block-sparse bundle problem and optimized on a private copy.

## Commit boundary

A successful optimization produces a candidate session with both map and pose versions incremented. `ReconstructionStateStore` accepts that candidate only when both versions still match the snapshot captured before optimization.

This gives the optimizer optimistic concurrency protection without holding mutable state during numerical work.

## Fail-closed behavior

Optimization is not committed when:

- the session is invalid
- the optimizer reports insufficient data
- the optimizer rejects the step
- the final cost is not finite
- the final cost does not improve
- another writer changed either map or pose version during optimization

## Calibration

Calibration is now part of the versioned session schema. This prevents an optimizer from silently borrowing unrelated camera parameters from ambient runtime state.

The current schema is version 3. Existing persisted snapshots must be migrated explicitly before being accepted by the reconstruction runtime.
