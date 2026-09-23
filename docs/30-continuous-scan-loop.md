# 30. Continuous Scan Loop

The realtime capture path now has a bounded scan scheduler and frame gate.

## Pipeline

```text
Camera preview
   |
   v
bounded scheduler
   |
   v
frame capture
   |
   v
quality gate
   |
   +---- reject: low quality
   |
   +---- reject: duplicate
   |
   v
accepted frame
   |
   v
coverage state
   |
   v
reconstruction pipeline
```

## Scheduling

The scheduler enforces both a maximum frame rate and an explicit minimum interval. This prevents camera processing from becoming an unbounded producer when downstream inference is slower than the camera.

## Duplicate suppression

Accepted frames are compared against a compact 16x16 luminance/color signature. This is an inexpensive first gate, not a substitute for model-based feature matching. The threshold is intentionally conservative and must be benchmarked against representative capture sequences.

## Coverage

The current coverage signal is deliberately simple: it tracks accepted viewpoint count as an initial bounded metric. True geometric/viewpoint coverage should later use local feature matching or pose estimation rather than pretending that frame count represents spatial coverage.

## Resource policy

The capture loop must never accumulate unlimited `ImageBitmap` objects. Once a frame has been accepted or rejected, ownership must be released by the caller when it is no longer needed.

## Adaptive quality

Future scheduler policy can lower capture frequency/resolution when inference backlog, memory pressure or device thermal/resource constraints rise. It must preserve accepted project data while reducing transient work.

## Privacy

All scan decisions remain local to the browser capture pipeline unless a separate feature explicitly requests network processing.
