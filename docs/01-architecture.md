# Veylune Architecture

## Purpose

Veylune is a local-first, browser-first platform for turning user-provided photographs into editable 3D representations and then extending those representations into animation, scenes, rendering, and export workflows.

## Core principles

1. Local-first: user photos and generated assets remain on the user's device by default.
2. Capability-driven: runtime selects GPU/CPU and model execution paths from measured browser capabilities.
3. Model-independent: application contracts describe semantic inputs/outputs rather than hard-coding a specific research model.
4. Evidence-aware reconstruction: multi-view evidence is preferred over hallucinated detail; inferred regions carry confidence metadata.
5. Progressive quality: a usable preview is produced early, then refined through independent passes.
6. Deterministic infrastructure: model wrappers, geometry operations, serialization, and benchmarks should be regression-testable.
7. Open interchange: GLB/glTF is the primary 3D interchange target.
8. License-aware: every model and production dependency has explicit provenance and license records.

## System overview

```text
Studio (Capture / Project / Viewer / Timeline / Materials / Export)
                              |
                        TypeScript API
                              |
Runtime (Project Store / Capabilities / Scheduler / Telemetry)
                              |
                     Inference / Engine API
                         /             \
                    Vision             Rust Engine
               (segmentation,       (geometry, fusion,
                pose, depth,        rigging, physics)
                features)                \
                         \             /
                           Asset Graph
                               |
                      GLB/glTF + metadata
```

## Repository structure

```text
apps/studio/                 Web application
crates/core/                 Stable engine types and orchestration
crates/geometry/             Mesh, topology, transforms, spatial structures
crates/reconstruction/       Multi-stage reconstruction
crates/vision/               Vision contracts and adapters
crates/gpu/                  GPU abstractions and compute utilities
crates/physics/              Future cloth/hair/secondary motion
crates/wasm/                 Browser boundary
packages/viewer/             Three.js/React presentation
packages/ui/                 Shared UI
packages/inference/          Browser inference orchestration
models/manifests/            Model metadata, versions, licenses
benchmarks/                  Fixtures and reports
docs/                        Architecture and research
tools/                       Conversion and validation utilities
```

## Data flow

1. Import photos as immutable source assets; derived images are separate artifacts.
2. Analyze resolution, blur, exposure, visibility, occlusion, pose/view, face visibility, and similarity.
3. Build an observation graph containing camera, pose, masks, landmarks, depth, features, and confidence.
4. Reconstruct using learned priors for one image, adding camera estimation, correspondence, and multi-view fusion for multiple images.
5. Refine geometry, topology, textures, materials, rigging, and confidence fields in independent passes.
6. Present the asset graph independently from reconstruction so the same asset supports multiple renderers and exports.

## Stable engine contracts

Core concepts include `Project`, `SourceImage`, `Observation`, `CameraEstimate`, `PoseEstimate`, `Mask`, `DepthField`, `FeatureSet`, `ReconstructionJob`, `MeshAsset`, `TextureAsset`, `MaterialAsset`, `Skeleton`, `AvatarAsset`, `ConfidenceField`, `Scene`, `Timeline`, and `ExportJob`.

Contracts use explicit versioning. Breaking changes require migration rather than silent reinterpretation.

## Job system

```text
queued -> preparing -> running -> refining -> completed
                         |                  |
                         +-> cancelled     +-> failed
```

Jobs record input artifact IDs, algorithm/model versions, capability profile, parameters, progress, outputs, warnings, and failure information.

## Capability system

At startup detect WebGPU availability and limits/features, WebAssembly support, SIMD, usable shared-memory/threading, device memory hints, storage capabilities, and browser-specific constraints.

## Privacy and security

The core reconstruction workflow requires no network service. Optional cloud features must be explicit opt-in features with separate APIs and data policies. Imported photographs are sensitive user assets; avoid accidental uploads, third-party analytics containing image metadata, and unsafe execution of untrusted content. Use strict CSP and dependency controls.

## Performance

Keep the UI thread responsive. Long operations belong in workers/WASM workers or GPU queues. Large binary artifacts should use transferable or shared-memory strategies where supported rather than repeated JavaScript object copies.

## Quality profiles

- Preview: fast geometry and coarse textures.
- Standard: balanced geometry, texture, and rigging refinement.
- High: additional correspondence, refinement, and texture passes.
- Maximum: all supported local passes subject to device capability.

Quality level is a preference, not a guarantee of visual accuracy.

## Failure model

Every stage must fail gracefully. If a model cannot run due to memory or backend limits, select a supported fallback or produce an actionable diagnostic. Preserve the last valid intermediate asset where possible.

## Initial implementation order

1. Repository and tooling baseline
2. Rust workspace and shared data types
3. WASM boundary
4. Browser capability profiler
5. Artifact/project storage
6. Model adapter interfaces
7. Benchmark harness
8. Basic viewer
9. Reconstruction pipeline skeleton
10. Real model integrations after infrastructure is measurable

Heavy ML models come after infrastructure can measure memory, latency, correctness, reproducibility, and licensing.
