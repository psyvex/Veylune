# 2. System Architecture

## 2.1 Architecture goals

The architecture must support:

- high-quality browser execution
- local privacy
- large intermediate datasets
- GPU compute
- CPU/WASM compute
- interchangeable ML models
- deterministic geometry operations where possible
- progressive reconstruction
- interactive 3D rendering
- future animation/physics
- future native packaging without rewriting the core

## 2.2 High-level architecture

```text
                         VireForge Studio
                               |
          +--------------------+--------------------+
          |                                         |
      TypeScript                                Rust Engine
          |                                         |
   React / Next.js                          Core domain + compute
   Zustand                                  Geometry
   UI                                      Reconstruction
   R3F                                      Physics
   Three.js                                 Export
          |                                         |
          +--------------------+--------------------+
                               |
                    Worker / WASM boundary
                               |
                 +-------------+-------------+
                 |                           |
              WebGPU                       WASM
                 |                           |
          GPU rendering/compute        CPU algorithms
                 |                           |
                 +-------------+-------------+
                               |
                         Local storage
                     IndexedDB / OPFS
```

## 2.3 Frontend boundary

TypeScript owns:

- application routing
- user interaction
- project/session state
- UI
- upload/capture UX
- 3D presentation
- timeline UI
- export dialogs
- capability reporting

TypeScript must not become a second implementation of core geometry/reconstruction algorithms.

## 2.4 Rust boundary

Rust owns:

- domain data structures
- geometry
- camera mathematics
- point-cloud processing
- reconstruction orchestration
- mesh processing
- confidence maps
- physics
- export preparation
- performance-sensitive CPU work
- deterministic numerical utilities

Rust code should be usable in native tests without a browser.

## 2.5 ML boundary

ML is an abstraction, not an application-wide dependency.

```text
InferenceEngine
  |
  +-- SegmentationModel
  +-- PoseModel
  +-- FaceModel
  +-- DepthModel
  +-- FeatureModel
  +-- ReconstructionModel
```

Each model should declare:

- input requirements
- output schema
- supported execution backends
- memory estimate
- precision
- model version
- license
- expected quality
- fallback behavior

## 2.6 Execution backends

Preferred order is capability-driven, not hard-coded:

```text
WebGPU -> WASM SIMD/threads -> WASM scalar fallback
```

ML may have a separate provider selection:

```text
WebGPU -> WASM
```

A model must never assume WebGPU exists.

## 2.7 Workers

Heavy work must not block the main UI thread.

Suggested workers:

```text
workers/
  vision.worker
  reconstruction.worker
  export.worker
```

The exact number should be determined by profiling rather than fixed prematurely.

## 2.8 Rendering

React Three Fiber/Three.js is the initial presentation layer.

The engine should expose render-ready data without depending on React.

This allows future:

- native viewer
- Electron/Tauri shell
- automated rendering
- headless testing
- alternative UI

## 2.9 Storage

Use IndexedDB for structured application data.

Use OPFS for large binary/intermediate artifacts where appropriate.

Project data should be addressable by stable IDs and content/version metadata.

## 2.10 Data flow

```text
Input Image
    |
    v
Decode/Normalize
    |
    v
Quality Analysis
    |
    v
Segmentation + Pose + View Classification
    |
    v
Depth / Feature Extraction
    |
    v
Camera Estimation
    |
    v
Multi-view Fusion OR Single-view Prior
    |
    v
Geometry
    |
    v
Texture
    |
    v
Confidence
    |
    v
Avatar Asset
    |
    +--> Scene
    +--> Animation
    +--> Render
    +--> Export
```

## 2.11 Error model

Every subsystem should return structured errors, not arbitrary strings.

Categories:

- unsupported capability
- insufficient input
- invalid asset
- model unavailable
- memory pressure
- GPU failure
- cancelled
- corrupted intermediate
- numerical failure
- export failure

User-facing messages should be generated from structured errors.

## 2.12 Versioning

Version:

- project schema
- asset schema
- reconstruction pipeline
- model metadata
- export pipeline

A project should record the exact pipeline/model versions used to create it.
