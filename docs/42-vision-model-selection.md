# 42. Vision Model Selection

## Current research result

The first model should be selected for browser feasibility, not just benchmark accuracy. Current Transformers.js documentation demonstrates MobileNetV4 Conv Small running through ONNX Runtime Web on WebGPU, while also noting that WebGPU support remains browser/device dependent. citeturn0search0turn0search8

For a permissive-license reference implementation, OpenCV Zoo documents MobileNet models and states that its model directory is Apache 2.0 licensed; its MobileNetV2 ONNX variants include quantized versions. citeturn0search6

The legacy ONNX Model Zoo should not be treated as the primary distribution path: its repository now describes itself as historical and directs model access toward Hugging Face. citeturn0search1

## Decision boundary

Veylune should not yet hard-code a production model artifact from this research pass. Before committing one, verify all of the following against the exact artifact:

1. model-card license and redistribution rights
2. exact ONNX artifact digest
3. input tensor shape, channel order and normalization
4. output tensor schema
5. operator support in the selected browser runtime
6. artifact size and memory footprint
7. WebGPU and WASM behavior on representative devices
8. benchmark latency and failure rate
9. whether classification outputs are actually useful for Veylune's scan problem

## Important distinction

MobileNet classification is useful as a runtime integration/benchmark fixture, but classification alone does **not** provide camera pose, feature matching, depth or geometric coverage. It must not be presented as a reconstruction or tracking model.

The production scan model should ultimately be selected for the actual task: local feature extraction/matching, depth, segmentation, or pose estimation as required by the reconstruction pipeline.

## Current browser strategy

Use WebGPU when supported and benchmarked; retain WASM as the broad compatibility path. Transformers.js documents both browser execution through ONNX Runtime and quantized models as a way to reduce browser resource requirements. citeturn0search8

No model artifact is committed by this document. This preserves the repository's existing integrity and licensing gates until the exact artifact has been independently verified.
