# 40. ONNX Runtime Web Integration

Veylune now has its first concrete browser inference engine adapter using ONNX Runtime Web 1.30.0.

The current package release is 1.30.0. Official ONNX Runtime documentation supports browser inference through WebAssembly, WebGPU and WebNN, with WebGPU imported through the dedicated WebGPU entry point. WebAssembly is the broadest CPU fallback, while WebGPU is intended for more compute-intensive browser inference.

## Adapter design

`OnnxInferenceEngine` implements Veylune's engine contract without exposing ONNX Runtime types to the rest of the application.

The adapter currently enforces a deliberately narrow realtime contract:

- exactly one input tensor
- exactly one output tensor
- `float32` tensors
- explicit tensor shapes
- asynchronous execution
- explicit session release

This makes the first integration predictable for lightweight vision models. More complex multi-input/multi-output models can be added through a separate adapter once their schemas are benchmarked.

## Backend selection

The engine receives the already-selected Veylune backend. It does not independently override capability selection.

```text
Veylune capability detection
        ↓
model/backend compatibility
        ↓
ONNX Runtime Web adapter
        ↓
WebGPU / WebNN / WASM
```

## Production deployment

ONNX Runtime Web requires its matching WebAssembly assets to be served correctly when the WASM path is used. Runtime JavaScript and WASM assets must come from the same release/build; mixing versions can cause initialization failures.

The production build should therefore keep runtime assets version-aligned and should not load arbitrary CDN runtime files.

## Readiness

Adding the runtime dependency does not automatically enable any model. Model activation remains gated by manifest validation, artifact digest verification, backend compatibility and measured benchmark readiness.

## Sources

- ONNX Runtime Web browser documentation: https://onnxruntime.ai/docs/tutorials/web/
- WebGPU execution provider documentation: https://onnxruntime.ai/docs/tutorials/web/ep-webgpu.html
- Production deployment guidance: https://onnxruntime.ai/docs/tutorials/web/deploy.html
