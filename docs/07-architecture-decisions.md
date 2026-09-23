# 7. Architecture Decisions

## ADR-001 — Local-first by default

**Decision:** User photographs and reconstruction processing are local by default.

**Reasoning:** Privacy is a product feature and also removes a mandatory inference backend.

**Consequence:** Model size, browser capability, memory, and download size become first-class engineering constraints.

## ADR-002 — Rust is the computational core

**Decision:** Use Rust for core domain logic, geometry, reconstruction orchestration, physics, and performance-sensitive processing.

**Reasoning:** We are explicitly optimizing for long-term quality and architecture rather than minimum development time.

**Consequence:** TypeScript should not duplicate core algorithms.

## ADR-003 — WebAssembly is the browser boundary

**Decision:** Compile the Rust engine to WASM for browser execution.

**Reasoning:** Portable execution with strong control over memory and CPU-heavy algorithms.

**Consequence:** JS/WASM APIs must be intentionally designed and versioned.

## ADR-004 — WebGPU is the preferred GPU path

**Decision:** WebGPU is the preferred custom GPU API when available.

**Reasoning:** It supports modern graphics and general compute in the browser.

**Consequence:** WebGPU cannot be treated as universally available. Capability profiles and WASM fallback are mandatory.

## ADR-005 — wgpu abstraction

**Decision:** Use `wgpu` as the Rust-side GPU abstraction candidate.

**Reasoning:** It provides a Rust API spanning native graphics APIs and browser WebGPU/WASM targets.

**Consequence:** GPU implementation details should remain behind a small engine boundary.

## ADR-006 — ML runtime abstraction

**Decision:** Do not couple the product to one AI model or provider.

**Reasoning:** Reconstruction research changes quickly and different models have different browser constraints.

**Consequence:** Model metadata and inference interfaces are versioned independently from the application.

## ADR-007 — ONNX Runtime Web candidate

**Decision:** Use ONNX Runtime Web as the initial candidate for browser ML execution.

**Reasoning:** It supports browser inference and execution providers including WebGPU and WASM.

**Consequence:** Individual models must still be benchmarked and verified for browser suitability.

## ADR-008 — Three.js/R3F for initial presentation

**Decision:** Use Three.js and React Three Fiber for the studio viewer.

**Reasoning:** They provide a mature web 3D presentation layer while keeping the engine independent.

**Consequence:** Rendering-facing data must be separated from React state and engine state.

## ADR-009 — Project is a scene document

**Decision:** VireForge projects represent avatars, scenes, animation, camera, lighting, and export settings.

**Reasoning:** The product is a creative studio, not a model generator.

**Consequence:** The project schema must be extensible from the beginning.

## ADR-010 — Observed vs inferred data is explicit

**Decision:** Reconstruction outputs carry evidence/confidence metadata.

**Reasoning:** Hidden geometry from insufficient photos is necessarily estimated.

**Consequence:** UI, export metadata, and refinement workflows can expose uncertainty.

## ADR-011 — Progressive reconstruction

**Decision:** Reconstruction produces reusable intermediate stages.

**Reasoning:** Long-running local computation should be cancellable and recoverable.

**Consequence:** Intermediate artifacts require schemas, storage policy, and version metadata.

## ADR-012 — Capability profiles

**Decision:** The application selects execution settings based on detected capabilities.

**Reasoning:** Browser/GPU/codec support varies.

**Consequence:** Quality tiers and fallback paths are part of normal operation.

## Alternatives considered

### All TypeScript
Rejected as the core architecture because long-term geometry/reconstruction/physics requirements justify a native-quality systems language and independent engine.

### Server-side AI
Not the default because it conflicts with the privacy/local-first product direction. It may become an optional future accelerator, but must never be required for the core workflow.

### C++/WASM
Technically viable, especially for existing computer-vision ecosystems, but Rust gives a strong unified safety/ownership model for a new engine.

### WebGL-only
Rejected as the primary GPU architecture. WebGL remains a compatibility/fallback concern; WebGPU is the intended modern path.

### One monolithic reconstruction model
Rejected. The system needs interchangeable components and explicit intermediate artifacts.
