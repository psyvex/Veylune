# Live Vision and Reconstruction Integration

The live scan path has a replaceable browser-local vision boundary. `LocalVisionExtractor` provides a deterministic CPU fallback based on image gradients and normalized local patches; production small-model/WebGPU implementations can implement the same `VisionExtractor` contract without changing capture orchestration.

`LiveReconstructionProcessor` owns the handoff from image frames to `CapturePipeline`: extract features, estimate a camera pose, initialize or advance the reconstruction, and publish only accepted sessions. Pose estimation remains an explicit dependency so tracking can later use a stronger local model without coupling the reconstruction layer to a particular inference runtime.

The live scheduler continues to enforce one in-flight frame and adapts its target rate from observed processing latency. Rejected frames never advance the reconstruction reference frame or session.
