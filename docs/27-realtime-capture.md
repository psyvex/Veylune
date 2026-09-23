# 27. Realtime Capture

Veylune supports a local-first capture path in addition to imported images.

## Capture modes

- single camera capture
- photo burst / multi-angle capture
- continuous scan session
- imported image sequence

## Browser boundary

Camera access uses `navigator.mediaDevices.getUserMedia()` and requires explicit browser permission. Audio is disabled by default.

Camera tracks must be stopped when the capture session ends, is cancelled, or the application no longer needs them.

## Pipeline

```text
Camera
  -> frame capture
  -> lightweight acceptance gate
  -> worker quality analysis
  -> accepted frame store
  -> reconstruction job
```

The UI thread should only handle camera control, preview and lightweight orchestration. Pixel-intensive quality analysis belongs in workers.

## Frame handling

Captured frames are represented as `ImageBitmap` objects to provide an explicit transferable-friendly boundary. Accepted frames should move into the storage/job pipeline rather than accumulating indefinitely in UI memory.

## Quality guidance

The capture system will progressively add realtime guidance for:

- blur/sharpness
- exposure
- framing
- viewpoint diversity
- motion stability
- overlap between views
- insufficient coverage

A frame-quality decision must be explainable to the user. A frame should never be silently discarded without an observable capture-state reason.

## Privacy

Camera data is local by default. No frame is uploaded by the capture layer. Network transfer, if later required by a specific feature, must cross an explicit application boundary and be visible to the user.

## Current implementation

The browser layer currently provides:

- camera session acquisition and shutdown
- configurable facing mode, resolution and frame rate
- frame capture as `ImageBitmap`
- capture session lifecycle
- initial dimension safety gate

Advanced quality analysis remains a worker/reconstruction responsibility and must not be faked by UI heuristics.
