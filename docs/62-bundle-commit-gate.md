# 62. Bundle Optimization Commit Gate

Bundle adjustment must never mutate the live local map merely because an optimizer returned a numerically valid vector.

The commit boundary now evaluates the optimization result before applying landmark coordinates.

## Acceptance requirements

1. The optimizer must report convergence.
2. Initial and final costs must be finite.
3. Final cost must be strictly lower than the initial cost.
4. Relative improvement must exceed the configured minimum.
5. Every updated landmark must remain in front of the camera-depth convention (`z > 0`).
6. Landmark displacement must remain below the configured safety bound.
7. Relative depth change must remain below the configured safety bound.
8. The map transaction version must still match when committing.
9. Snapshot validation must pass before mutation.

A failure at any gate leaves the active map unchanged.

## Concurrency

The transaction is optimistic: reconstruction can continue while optimization runs. If another map mutation occurs before commit, the version check rejects the stale optimization result instead of overwriting newer state.

## Current scope

The map currently stores landmark geometry but not camera poses in `LocalMapSnapshot`, so this boundary commits optimized landmark coordinates only. Camera-state persistence should be introduced alongside the future keyframe pose model rather than hidden in ad-hoc metadata.
