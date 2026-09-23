# 52. Map Window and Relocalization

The capture backend now has bounded map-window and relocalization boundaries.

## Map window

Active keyframes are selected around the current frame and capped by a configurable budget. This prevents browser memory and optimization cost from growing without bound during long scans.

Evicted keyframe IDs are reported explicitly so a future map store can archive or discard their dependent data according to project policy.

## Relocalization

When tracking is lost, the system can evaluate candidate keyframes using verified feature matches and a confidence threshold. Candidate selection is deliberately separate from pose commitment: selecting a candidate does not mean that the camera has been relocalized.

A production relocalizer must additionally perform geometric verification against the candidate, recover a valid camera pose, check reprojection error and cheirality, and require temporal stability before resuming scan updates.

## Optimization lifecycle

```text
active local window
  -> quality pruning
  -> robust local optimization
  -> validate before/after error
  -> commit atomically
  -> tracking loss
  -> candidate keyframe search
  -> geometric verification
  -> pose recovery
  -> resume or remain in recovery
```

Failed optimization or relocalization must never replace the last known-good map/pose with an invalid state.
