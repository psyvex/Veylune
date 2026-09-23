# Live tracking and keyframe policy

The live reconstruction path separates two decisions: whether tracking is currently healthy, and whether the accepted frame contains enough new camera motion to become a keyframe.

`TrackingRecovery` prevents one bad frame from destroying a valid track. Temporary failures enter `recovering`; repeated failures transition to `lost`, and the reconstruction processor resets its map and pose estimator at that boundary. Successful observations then initialize a clean sequence.

`KeyframePolicy` requires usable tracking confidence and inlier support before inserting a keyframe. Translation, rotation, or a maximum elapsed interval can trigger insertion. Tracking frames therefore do not automatically grow the pose graph.
