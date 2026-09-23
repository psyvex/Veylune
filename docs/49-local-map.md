# 49. Local Map and Keyframes

Veylune now has a local reconstruction map boundary for validated 3D landmarks and keyframes.

## Keyframes

A keyframe records a stable frame identity, timestamp, frame index and the landmarks observed from that frame.

## Landmarks

A landmark stores a local 3D position, observation count and most recent frame. Repeated observations are conservatively averaged rather than replacing an established landmark with a single noisy measurement.

## Lifecycle

```text
accepted pose
   -> validated triangulated points
   -> landmark observation
   -> keyframe selection
   -> local map
   -> future bundle adjustment / relocalization
```

## Production constraints

The current map is intentionally minimal. Production reconstruction still needs:

- stable landmark IDs derived from track identity, not arbitrary frame-local IDs
- track history and observation metadata
- keyframe selection based on motion, coverage and information gain
- bounded map memory and pruning
- covariance/uncertainty estimates
- local bundle adjustment
- relocalization after tracking loss
- loop-closure handling for larger scans
- explicit project reset/export semantics

All map state is intended to remain local to the active project unless the user explicitly exports it.
