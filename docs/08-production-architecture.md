# 8. Production Architecture

Status: Adopted baseline

This document extends the original architecture with the requirements discovered during production-readiness research. It is the target architecture for Veylune unless a later ADR supersedes it.

## 8.1 Core principles

1. Local-first: source photos and project data remain on-device by default.
2. Capability-driven: never assume WebGPU, WebNN, a codec, large memory, or a particular GPU exists.
3. Progressive: expensive work produces checkpoints and useful intermediate artifacts.
4. Evidence-aware: observed, reconstructed, inferred, generated, and uncertain content remain distinguishable.
5. Replaceable: rendering, ML runtimes, models, and exporters sit behind explicit interfaces.
6. Secure-by-default: untrusted project/assets/models are parsed under strict resource limits.
7. Versioned: project schema, pipeline, model, runtime, and export metadata are versioned.
8. Testable: core algorithms execute without the browser and every capability path has tests.

## 8.2 Runtime layers

```text
Studio UI
  |
Application State / Commands
  |
Domain API
  |
+----------------------+----------------------+
|                      |                      |
Rust/WASM Core       ML Runtime            Renderer
|                      |                      |
Geometry             ONNX/WebNN            WebGPU
Reconstruction       Model adapters        WebGL fallback
Assets               Pre/post processing   R3F/Three presentation
Physics              Confidence            GPU resource manager
|
+----------------------+----------------------+
                   Storage
          IndexedDB + OPFS + Cache
```

The browser application is an orchestration/presentation layer. Core domain state must not depend on React.

## 8.3 Rust workspace boundaries

Recommended crates:

```text
crates/
  core-domain/       IDs, schemas, commands, errors
  math/              transforms, cameras, numerical primitives
  geometry/          meshes, point clouds, topology
  reconstruction/    pipeline orchestration and fusion
  assets/            asset graph and validation
  materials/         PBR/material processing
  animation/         rigs, clips, retargeting
  physics/           future simulation boundary
  project/            project serialization/migration
  export/             glTF/GLB and future exporters
  gpu/                wgpu abstraction and GPU jobs
  wasm-api/           stable JS/WASM boundary
  test-fixtures/      deterministic fixtures and helpers
```

Crates should avoid circular ownership. `core-domain` must remain independent of browser APIs.

## 8.4 TypeScript boundaries

```text
packages/
  ui/                 design system and accessible components
  app-state/          commands, UI state, session state
  engine-client/      typed WASM/worker API
  renderer/           Three/R3F integration
  capture/            camera/upload/capture UX
  inference-client/   model runtime orchestration
  storage/            IndexedDB/OPFS abstraction
  project-client/     project lifecycle
  diagnostics/        local/opt-in diagnostics
```

React components consume commands and selectors. They do not mutate Rust engine internals directly.

## 8.5 Job system

All expensive operations use a common job lifecycle:

```text
created -> queued -> running -> checkpointing -> completed
                         |             |
                         +-> cancelling -> cancelled
                         |
                         +-> failed
                         |
                         +-> paused -> resumed
```

A job has:

- stable ID
- pipeline version
- input artifact IDs
- capability profile
- estimated resource class
- progress stage
- cancellation token
- checkpoint IDs
- error code
- output artifact IDs

Progress is stage-based. Never display fabricated percentage precision.

## 8.6 Worker topology

```text
Main thread
  |
  +-- UI/render scheduling
  |
  +-- engine worker
  |      +-- WASM CPU jobs
  |      +-- reconstruction
  |
  +-- inference worker
  |      +-- ONNX Runtime Web
  |
  +-- asset worker
  |      +-- parsing/validation
  |      +-- compression
  |
  +-- export worker
         +-- offline rendering coordination
         +-- encoding
```

The exact worker count remains adaptive. Workers are a resource boundary, not a fixed requirement per feature.

## 8.7 GPU architecture

Use WebGPU as the preferred GPU path where available. Keep a WebGL presentation fallback for compatible rendering paths. WebGPU is still not universally available, so capability detection remains mandatory. See MDN WebGPU documentation and compatibility data.

GPU ownership should be centralized in a resource manager responsible for:

- device creation
- adapter selection
- feature/limit negotiation
- buffer pools
- texture pools
- staging resources
- command submission
- loss/recovery
- memory budgeting
- debug labels

WebGPU may execute in workers where supported, enabling expensive GPU work away from the UI thread.

## 8.8 ML architecture

Use an inference-provider abstraction:

```text
InferenceEngine
  |
  +-- WebGPU provider
  +-- WebNN provider
  +-- WASM provider
  +-- future native/provider
```

Provider selection is capability and model dependent.

Recommended initial order:

```text
WebGPU -> WebNN when validated -> WASM
```

Do not make WebNN a hard dependency while browser availability/operator coverage remains inconsistent. ONNX Runtime Web currently documents WebGPU and WebNN as supported execution paths with varying browser/operator support.

Every model manifest records:

- model ID/version
- license
- source
- checksum
- architecture
- input/output schema
- supported execution providers
- precision
- minimum memory estimate
- benchmark results
- known failure modes
- intended use
- prohibited/unsupported use

## 8.9 Storage architecture

Use:

- IndexedDB for metadata, project state, indexes, and small structured records.
- OPFS for large binary artifacts and checkpoints.
- Cache Storage/service worker for immutable application/model assets where appropriate.

Never treat browser storage as guaranteed durable storage. Maintain explicit quota detection, eviction policy, export/backup flow, and recovery behavior.

## 8.10 Asset graph

Every project asset has:

```text
AssetId
AssetType
SchemaVersion
ContentHash
ParentIds
Dependencies
SourceIds
PipelineVersion
ModelVersions
EvidenceMetadata
CreatedAt
UpdatedAt
```

Derived assets reference their source artifacts instead of silently duplicating them.

## 8.11 Evidence model

Every reconstructed region can carry:

```text
observed
reconstructed-from-observation
inferred
model-generated
uncertain
unavailable
```

Confidence is multidimensional:

- geometry
- texture
- identity/detail
- pose
- camera

Confidence is an engineering evidence score, not a scientific probability.

## 8.12 Project format

The native project format remains a Veylune scene/document format. glTF/GLB is an interchange/export format, not the authoritative authoring state.

Native project data must support schema migrations and retain enough provenance to reproduce or explain derived assets.

## 8.13 Native/cloud boundary

The product remains fully useful without a server.

If optional cloud services are introduced later, isolate them behind explicit capability boundaries:

```text
Local Project
     |
Optional Cloud Adapter
     |
+----+----------------+
|                     |
Sync               Remote inference
```

No cloud feature may silently upload photographs, biometric-like representations, or project content.

## 8.14 Future-proofing

The architecture intentionally leaves extension points for:

- improved browser ML runtimes
- NPUs through WebNN or future APIs
- neural rendering
- Gaussian splatting
- improved monocular/multi-view reconstruction
- native desktop acceleration
- optional cloud acceleration
- advanced physics

These are adapters and future capabilities, not reasons to destabilize the foundation now.
