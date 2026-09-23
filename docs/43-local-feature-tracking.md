# 43. Local Feature Tracking

The scan architecture now has a model-independent local feature matching boundary for actual viewpoint tracking.

## Why features

Image classification can identify image content, but it does not establish camera motion or geometric correspondence. Realtime scan coverage needs repeatable correspondences between frames.

The feature layer therefore represents:

- keypoint coordinates
- keypoint confidence
- descriptor vectors
- descriptor dimension
- matched reference/current indices
- descriptor distance

## Confidence

Only finite, bounded match distances are retained. Tracking confidence is derived from reliable correspondence count and is capped at `1`.

This confidence is deliberately not presented as a geometric pose estimate. A later geometric verification stage must reject outliers and estimate motion/pose from the correspondences.

## Production pipeline

```text
frame A -> local features --+
                            +-> descriptor matching -> geometric verification -> pose
frame B -> local features --+
```

The existing pose contract remains the authority for scan guidance. Feature matches become evidence for that estimator rather than being treated as pose themselves.

## Privacy

Feature extraction and matching are designed for local browser execution. Descriptors should be treated as project-derived data and must follow the same local-storage/export rules as other captured project data.

## Next step

Integrate a maintained browser-compatible feature detector/descriptor implementation, then add robust geometric verification (for example, outlier rejection plus essential/homography estimation where appropriate) before using matches to update camera pose.
