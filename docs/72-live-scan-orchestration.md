# Live scan orchestration

`LiveScanSession` is the main-thread capture boundary between a camera `HTMLVideoElement` and a vision/reconstruction processor. It deliberately accepts a processor interface instead of importing a model implementation, so local inference and reconstruction remain replaceable.

The session provides three safeguards for live capture:

- **single-flight backpressure:** a new frame is not submitted while the previous frame is still being processed;
- **bounded input:** frames are downscaled to a configurable maximum width before `ImageData` extraction;
- **adaptive pacing:** sustained processing latency reduces the capture target, while consistently low latency allows it to recover toward the configured ceiling.

A processor returning `false` is treated as a tracking-loss/rejected-frame signal. The session does not fabricate a pose or map update; the processor owns that decision. Stopping the session cancels the animation loop, stops the camera, and resets processor state.

The intended production composition is:

`CameraSession -> LiveScanSession -> local vision/tracking adapter -> CapturePipeline -> reconstruction worker -> atomic state store`.

The worker remains the owner of expensive bundle adjustment. The live scan loop should only perform bounded frame preparation and dispatch.
