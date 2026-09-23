# 64. Atomic Local-Map Updates

Optimization must never mutate the active reconstruction state halfway through a numerical solve.

The local map now exposes immutable snapshots with a monotonically increasing version. A transaction records the source version, works on a copied candidate, validates the complete candidate, and commits only if the source version is unchanged.

## Failure semantics

- stale transaction: rejected
- duplicate IDs: rejected
- invalid/non-finite landmark coordinates: rejected
- non-positive landmark depth: rejected
- invalid observation counts/frame metadata: rejected
- keyframes referencing missing landmarks: rejected

This gives the optimization layer a safe integration point for asynchronous worker execution: a worker may optimize an older snapshot, but its result cannot overwrite newer capture state.

## Next integration

The bundle optimizer should consume a snapshot, produce a candidate snapshot, validate reprojection/error metrics, and commit through this transaction boundary. The live map remains unchanged on any numerical, cancellation, or validation failure.
