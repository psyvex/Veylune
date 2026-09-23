# Live tracking and keyframe policy

The live reconstruction path separates two decisions: whether tracking is currently healthy, and whether the accepted frame contains enough new camera motion to become a keyframe.

`TrackingRecovery` prevents one bad frame from destroying a valid track. Temporary failures enter `recovering`; only consecutive failures transition to `lost`, and consecutive successful observations are required before returning to `tracking`.

`KeyframePolicy` requires usable tracking confidence and inlier support before inserting a keyframe. Translation, rotation, or a maximum elapsed interval can trigger insertion. This avoids flooding the map with nearly identical frames while still preventing long gaps in the pose graph.

These policies are deliberately independent of camera acquisition and numerical optimization. The capture processor can use them to decide when to update the reference frame and when to request bundle adjustment.
