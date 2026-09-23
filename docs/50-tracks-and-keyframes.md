# 50. Feature Tracks and Keyframes

The local map now has explicit persistent feature tracks and an information-driven keyframe policy.

## Feature tracks

Tracks connect the same visual feature across consecutive frames. A track records its observation history, age and most recent frame. Tracks that disappear for more than one frame are retired so stale correspondences do not remain in the active state indefinitely.

Tracks with multiple observations can be promoted as stable candidates for reconstruction.

## Keyframe policy

A keyframe is not created on every frame. The default policy requires:

- a minimum stable-track population
- a minimum interval since the previous keyframe
- sufficient parallax, or a low-confidence recovery condition

This makes keyframe creation depend on new geometric information rather than arbitrary frame count.

## Production considerations

The current implementation is a foundation and should be extended with:

- spatial distribution checks so tracks are not concentrated in one image region
- track quality/descriptor consistency
- forward-backward matching checks
- occlusion handling
- adaptive thresholds based on camera resolution and field of view
- keyframe redundancy tests
- map-memory budgets
- deterministic IDs when maps are persisted/exported

Track identity remains local to the active capture session until a persistent map identity scheme is introduced.
