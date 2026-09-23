# 31. Pose, Coverage and Scan Guidance

Veylune now separates frame-count coverage from geometric/viewpoint coverage.

## Pose boundary

`PoseEstimator` is intentionally model/runtime independent. A future local feature/pose model can provide camera-relative translation, rotation and confidence without changing the scan controller.

## Coverage

Only sufficiently confident pose estimates contribute to viewpoint coverage. Near-identical poses are suppressed, and coverage history is bounded to avoid unbounded memory growth.

## Guidance

The scan controller exposes user-facing guidance states rather than raw model output:

- insufficient tracking
- hold steady
- change viewpoint
- coverage good
- directional movement hints for future estimator integration

Guidance is advisory. It must not claim geometric coverage quality when tracking confidence is insufficient.

## Quality

Capture quality combines sharpness, exposure, contrast and motion into a bounded score. The scoring boundary is deterministic and can later consume local-model measurements without coupling the UI to a specific model.

## Production requirement

Real pose estimation should be backed by a benchmarked local model or geometric estimator before being presented as authoritative. The current contracts deliberately avoid fabricating pose data from image count or camera metadata.
