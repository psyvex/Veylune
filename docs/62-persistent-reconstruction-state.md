# 62. Persistent Reconstruction State

The reconstruction model now separates three concerns:

1. **Local map** — landmarks and keyframe identity/versioning.
2. **Pose graph** — persistent camera poses with a single fixed gauge reference.
3. **Reconstruction session** — a versioned boundary joining map and pose state.

The existing local map remains the authoritative landmark/keyframe store. Camera poses are intentionally maintained in a separate pose graph until the map schema is migrated to persist full keyframe state.

## Invariants

- IDs are unique within each state collection.
- At most one pose is fixed.
- Pose matrices/translations must be finite.
- Session poses must reference existing keyframes.
- Session creation validates the complete combined snapshot.
- Pose commits use optimistic version checking.
- Failed validation never mutates the active pose graph.

## BA integration boundary

Bundle adjustment may operate on a session snapshot, but its result must not directly mutate either live state. The result must pass the numerical acceptance gate and then be committed against both source versions. If either version changed while optimization was running, the result is stale and must be discarded/recomputed.

## Next state evolution

The next schema migration should make keyframes first-class reconstruction records containing camera calibration identity, pose, feature references, and observation metadata. This must be done as a migration rather than by overloading the current landmark-only structure.
