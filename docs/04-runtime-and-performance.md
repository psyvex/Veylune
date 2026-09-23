# 4. Runtime, GPU, Memory, and Performance

## 4.1 Philosophy

Performance is not “make it fast at any cost”.

The goal is:

- predictable memory use
- stable frame rate during interaction
- responsive UI
- bounded intermediate storage
- graceful degradation
- measurable quality/performance trade-offs

## 4.2 Browser capability detection

At startup, detect:

- WebGPU
- adapter limits/features
- device memory where available
- hardware concurrency
- WASM SIMD
- WASM threads
- cross-origin isolation requirements
- video encoder availability
- image format support
- storage quota
- browser-specific restrictions

Build a capability profile.

Example:

```text
Profile: Desktop High
WebGPU: yes
WASM SIMD: yes
WASM threads: yes
Video encoding: yes
Recommended reconstruction: high
```

## 4.3 WebGPU

WebGPU is the preferred GPU API for custom compute/rendering where supported. It is designed for both graphics and general GPU computation, but browser support is not universal, so capability detection and fallback remain mandatory.

Use WebGPU for:

- image preprocessing
- depth postprocessing
- point-cloud operations
- texture operations
- rendering
- future custom reconstruction kernels

Use GPU buffers/textures to reduce unnecessary CPU/GPU copies.

## 4.4 Rust + wgpu

`wgpu` is a candidate Rust graphics abstraction because it can target WebGPU in WASM and native graphics APIs outside the browser.

The engine should isolate `wgpu` behind a small GPU abstraction so the rest of the Rust domain layer does not depend directly on GPU implementation details.

## 4.5 WASM

Rust/WASM is the primary portable CPU engine.

Use it for:

- geometry
- mesh processing
- numerical utilities
- deterministic transformations
- CPU fallback
- non-GPU reconstruction operations

Use WASM SIMD/threads where supported and safe.

## 4.6 ML execution

ONNX Runtime Web is a candidate browser inference runtime.

Preferred strategy:

```text
WebGPU
  |
  v
GPU inference

fallback

WASM
  |
  v
CPU inference
```

Models should be optimized for browser memory constraints.

Where practical:

- quantize
- use reduced precision
- use tiled processing
- avoid unnecessary copies
- cache initialized sessions

## 4.7 Main-thread rules

Never perform large reconstruction loops on the main thread.

Main thread should remain responsible for:

- input
- UI
- scene interaction
- scheduling
- presentation

Workers handle:

- ML
- reconstruction
- exports
- expensive conversions

## 4.8 Memory budgets

Every pipeline stage should estimate memory before allocating large buffers.

Prefer:

- streaming
- tiling
- chunking
- buffer reuse
- explicit lifetime management

Intermediate artifacts should be evictable.

## 4.9 Cancellation

Every long-running job must accept cancellation.

Cancellation must be cooperative and checked between expensive stages.

```text
Job
 |
 +-- running
 +-- cancelling
 +-- cancelled
 +-- completed
 +-- failed
```

## 4.10 Progress reporting

Progress should be stage-based and weighted.

Do not fake percentage precision.

Prefer:

```text
Reconstructing surface
Step 3 of 6
```

over an inaccurate `73%`.

## 4.11 Performance instrumentation

Collect local development diagnostics:

- CPU stage time
- GPU stage time
- peak memory
- allocations
- worker utilization
- model initialization time
- frame time
- upload/download time
- export time

Do not send image content or private project data to telemetry by default.

## 4.12 Quality tiers

Define capability profiles:

### Preview
Fastest, lower resolution.

### Balanced
Default desktop experience.

### High
Higher resolution and more refinement.

### Maximum
May require substantial GPU memory and time.

Quality settings must affect explicit pipeline parameters rather than hidden magic.

## 4.13 Export performance

Rendering a video should use an offline/frame-accurate path where possible rather than depending solely on real-time capture.

Target architecture:

```text
Timeline
  |
Frame scheduler
  |
Scene evaluation
  |
GPU render
  |
Encoder
  |
Output
```

## 4.14 Browser limitations

The application must assume that:

- WebGPU availability varies
- codec support varies
- GPU memory is not directly equivalent to system RAM
- mobile devices have tighter thermal/memory constraints
- large models can cause tab instability

Capability checks are therefore part of correctness, not merely optimization.
