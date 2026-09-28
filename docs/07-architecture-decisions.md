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

## ADR-013 — Reconstruction math is ported into Rust/WASM, not duplicated in TypeScript

**Decision:** The numerical reconstruction pipeline (feature tracking math,
SE3, triangulation, Jacobians, Schur-complement bundle adjustment, robust
loss, linear solves) is implemented in `crates/geometry` and
`crates/reconstruction`, compiled to WASM, and called from TypeScript through
a typed bridge crate. TypeScript owns orchestration, UI, capture control flow,
and worker scheduling around that boundary, not the numerical core itself.

**Context:** As of 2026-09-25, this pipeline was prototyped directly in
TypeScript under `apps/web/src/capture/` (bundle adjustment, Schur solves,
triangulation, SE3, Jacobians, robust loss, linear solves) ahead of the
Rust/WASM boundary being built, which put the codebase out of step with
ADR-002 and ADR-003. See `docs/75-production-task-pipeline.md` for the full
review and the staged migration plan (Stage 1).

**Reasoning:** ADR-002 already commits core algorithms to Rust for long-term
quality, memory control, and reuse outside the browser (native tooling,
benchmarking, future desktop/CLI surfaces). Leaving the numerical core in
TypeScript permanently would mean maintaining two implementations in
practice — the existing TS code as the de facto engine, and Rust crates that
never grow beyond data types — which contradicts the stated architecture and
makes a later migration strictly more expensive as more capture logic is
added on top of the TS math.

**Consequence:**
- New reconstruction math is written in Rust first; TypeScript may prototype
  an algorithm behind a feature flag but must not become the shipped path.
- The existing TS numerical modules are migrated per the dependency order in
  `docs/75-production-task-pipeline.md` (Stage 1), each with a parity test
  against fixtures before the TS implementation is deleted.
- `apps/web/src/capture/` retains orchestration, worker/session management,
  guidance/HUD, and UI-facing state, calling into the WASM bridge for math.

## ADR-014 — `CameraPose.translation` is the camera's world-space center

**Decision:** Every consumer of `CameraPose` (`{ rotation, translation }`)
treats `translation` as the camera's position in world space — a point,
`C` — and projects a world point `P` into camera space as `q = R·(P − C)`.
This is now enforced consistently across `triangulation.ts`,
`essential-matrix.ts`, `local-pose-estimator.ts`, `reprojection.ts`,
`bundle-problem.ts`, and `bundle-linearization.ts` (TS), and their Rust
ports in `crates/geometry`/`crates/reconstruction`.

**Context:** Found 2026-09-28 while building a WASM parity-test fixture for
`triangulateCorrespondences`: projecting points the way `reprojection.ts`
does (`q = R·P + t`, the standard world-to-camera translation) silently
rejected every triangulated point. `triangulation.ts`'s `unprojectRay` and
`essential-matrix.ts`'s `essentialFromPoses` (which names the field `C1`/
`C2`) already used `translation` as a world-space center; so does
`local-pose-estimator.ts`'s `composePose`, which accumulates poses by plain
addition (`base.translation[i] + delta[i]`) — correct for a center, wrong
for a standard `t`. `reprojection.ts`, `bundle-problem.ts`'s
`projectWorldPoint`, and `bundle-linearization.ts`'s `linearizeObservation`
had instead used `R·P + t`, and `reconstruction-optimizer.ts`'s
`toBundleProblem` passes `KeyframePose.pose` into `BundleProblem` with zero
conversion — so the bundle-adjustment optimizer was computing residuals and
Jacobians against a different geometric model than the one the tracking
pipeline (`local-pose-estimator.ts`, `triangulation.ts`) actually produced
and consumed, for every camera whose translation is nonzero (i.e. every
non-anchor camera in every real capture). The error scales with
`2·|translation|` before the perspective divide — not a rounding issue.

**Fix, precisely:**
- `reprojection.ts`'s `projectPoint`, `bundle-problem.ts`'s
  `projectWorldPoint`, `bundle-linearization.ts`'s `linearizeObservation`:
  `q = R·(P − C)` instead of `R·P + t`.
- `bundle-linearization.ts`'s analytic camera Jacobian: `∂q/∂C = −R` (was
  `I`) for the translation block; the rotation block (`∂q/∂ω = −[q]×`) is
  unchanged — it only depends on `q`, which is now computed correctly.
- `bundle-optimizer.ts`'s `applyBundleStep`: the camera center's
  Gauss-Newton step is now a plain world-frame add (`C_new = C + step`),
  not `applySE3Increment`'s SE3 group composition (`t_new = ΔR·t + Δt`,
  correct only for a standard `t`). The rotation update (`so3Exp(step)`
  left-multiplied onto `R`) is unchanged.
- Mirrored in the Rust ports (`reprojection.rs`, `bundle_linearization.rs`,
  `bundle_optimizer.rs`'s `apply_camera_steps`), each with a new test that
  locks in the center-vs-`t` distinction with a nonzero-translation
  fixture, plus a centered finite-difference cross-check
  (`bundle-linearization-analytic.test.ts`) proving the fixed analytic
  Jacobian against numerical differentiation of the fixed forward model.
- `reconstruction-worker.test.ts`'s fixture, which hand-built "already
  optimal" pixel observations using the old (`+t`) formula, updated to the
  new (`−C`) one so its zero-residual premise still holds.

**Consequence:** Any new code that reads `CameraPose.translation` must
treat it as a center and project with `R·(P − C)`, not `R·P + t`. A
reviewer adding a new consumer should grep for the existing pattern
(`− c[0]`/`- center[0]`) rather than copying an older, now-fixed file from
before this ADR.

**Follow-up fix, same audit, 2026-09-28:** `bundle-block-assembly.ts`'s
`assembleBundleBlocks` (and its Rust port,
`crates/reconstruction/src/bundle_block_assembly.rs`) skipped an
observation's landmark Hessian/gradient contribution entirely whenever its
camera had no index in the (non-fixed-only) camera index map — i.e.
whenever the camera was **fixed**, not only when it was genuinely absent.
A landmark seen by the fixed anchor camera plus free cameras lost the
anchor's (most trustworthy, since its pose isn't being perturbed)
contribution to its own optimization. Fixed: the camera block/gradient
still skips fixed cameras (correct — nothing to solve for), but the
landmark block/gradient and residual now accumulate for every valid
observation regardless of whether its camera is fixed; only the
camera-landmark coupling term requires an actual camera index to couple
to. See `bundle_block_assembly.rs`'s module doc and its
`a_landmark_seen_by_a_fixed_and_a_free_camera_accumulates_both_observations`
test for the exact before/after.

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
