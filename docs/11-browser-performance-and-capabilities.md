# 11. Browser Capability and Performance Strategy

Status: Adopted baseline

## 11.1 Capability matrix

Veylune must classify a device at runtime instead of using browser user-agent assumptions.

Collect only what is needed for capability selection:

- secure context
- WebGPU availability
- adapter limits/features
- WebAssembly SIMD
- WebAssembly threads
- SharedArrayBuffer/cross-origin isolation
- WebNN availability
- WebCodecs availability
- storage availability/quota
- hardware concurrency where useful
- viewport/device class

Do not collect persistent hardware fingerprints merely to improve quality selection.

## 11.2 Execution tiers

### Tier 0 — Compatibility

- CPU/WASM
- reduced image resolution
- low-poly preview
- limited concurrent work
- basic rendering fallback

### Tier 1 — Standard

- WASM SIMD
- WebGL or WebGPU where available
- moderate reconstruction
- background workers

### Tier 2 — Accelerated

- WebGPU
- GPU inference
- larger textures
- multi-view refinement
- higher-quality preview

### Tier 3 — High-end

- WebGPU with larger resource budgets
- parallel inference/reconstruction
- high-resolution textures
- advanced refinement
- offline rendering

The tier is a runtime recommendation, not a user-visible promise of exact performance.

## 11.3 ML provider policy

ONNX Runtime Web currently exposes WASM, WebGPU, WebNN, and WebGL execution providers, but browser/provider support varies. WebGPU is the primary accelerated browser path; WASM remains the compatibility path. WebGL should be treated as legacy/maintenance compatibility for ML rather than the preferred new path.

Reference: https://onnxruntime.ai/docs/tutorials/web/

## 11.4 Model loading

Models must be:

- version pinned
- integrity checked
- lazy loaded
- cached after successful verification
- unloaded when memory pressure requires it
- segmented/sharded where beneficial

Never download every model on first launch.

## 11.5 Model memory policy

Before loading a model:

1. estimate model memory
2. estimate input/output tensors
3. reserve a safety margin
4. check current workload
5. choose a lower-tier model if budget is insufficient

When memory pressure occurs:

- stop optional jobs
- unload unused sessions
- reduce resolution
- release staging buffers
- checkpoint work
- offer a resumable retry

## 11.6 Image pipeline optimization

Avoid unnecessary copies:

```text
Camera/File
   |
Decode
   |
GPU/Worker preprocessing
   |
Inference
   |
Intermediate tensors
   |
Geometry/texture processing
```

Do not repeatedly convert full-resolution images between JS objects, CPU buffers, GPU textures, and WASM memory.

## 11.7 Rendering performance

Target:

- interactive viewport response
- adaptive render resolution
- LOD switching
- frustum/occlusion culling where beneficial
- instancing
- texture compression
- GPU buffer reuse
- shader/pipeline caching

Never sacrifice correctness to hit a nominal frame-rate number.

## 11.8 Mobile strategy

Mobile devices must be treated as first-class clients.

Use:

- smaller preview models
- lower-resolution analysis
- progressive refinement
- thermal-aware throttling
- fewer concurrent jobs
- aggressive checkpointing
- battery-aware messaging

Do not start a high-cost reconstruction immediately after upload without giving the user control when the workload is substantial.

## 11.9 Browser lifecycle

Handle:

- tab suspension
- visibility changes
- page reloads
- worker termination
- GPU device loss
- storage quota failures
- interrupted downloads

Long jobs must be resumable from checkpoints.

## 11.10 GPU device loss

The renderer and GPU compute layer must recover from device loss where the browser allows it:

```text
GPU lost
  |
  v
Pause jobs
  |
  v
Persist checkpoint
  |
  v
Recreate adapter/device
  |
  v
Rebuild GPU resources
  |
  v
Resume or degrade to CPU
```

## 11.11 Performance measurement

Benchmarks must report:

- startup time
- first interactive frame
- model load time
- inference time
- reconstruction stage times
- peak CPU memory
- peak WASM memory
- estimated GPU resource usage
- export time
- battery/thermal behavior where measurable

Report distributions, not only averages.

## 11.12 Quality/performance contract

Every quality setting maps to explicit controls:

```text
Preview
  resolution
  model size
  iteration count
  texture size
  LOD

Balanced
  resolution
  model
  refinement
  texture size

High
  resolution
  model
  refinement
  texture
  export quality
```

No hidden quality changes should occur without being represented in the project metadata.

## 11.13 Current technology conclusion

The current Veylune choice of Rust/WASM + WebGPU + browser TypeScript remains directionally correct. WebGPU is the right primary accelerated path, but its browser availability is still not universal, so a capability-driven WASM path is mandatory. ONNX Runtime Web provides a practical abstraction for browser inference, while WebNN should remain an optional accelerator until support is broad enough for a mandatory dependency.
