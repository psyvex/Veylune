# 32. Adaptive Capture Guidance

The scan layer now converts pose changes into bounded user guidance and adapts capture load when downstream processing falls behind.

## Guidance

Guidance is derived only when pose confidence is sufficient. The system can surface directional hints, viewpoint changes, steady-state guidance and completion of the current coverage target.

Low-confidence tracking produces `insufficient_tracking` rather than a fabricated movement instruction.

## Adaptive capture

Capture quality is not fixed at maximum settings. The scheduler can reduce frame rate and maximum resolution when:

- inference queue depth grows
- processing latency increases
- memory pressure becomes high

This protects responsiveness and prevents an unbounded producer/consumer backlog.

## Product behavior

Adaptive changes should be communicated through a concise UI state when they materially affect capture quality. The user should not need to understand GPU memory, worker queues or browser internals.

## Safety

The adaptive policy changes transient capture workload only. It must never discard already accepted project frames or mutate committed project revisions.

## Future integration

The next production step is to connect this policy to actual worker telemetry and a benchmarked local pose/feature model. Until then, directional guidance remains an interface boundary rather than a claim of accurate 3D tracking.
