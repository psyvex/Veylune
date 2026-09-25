# 75. Production Task Pipeline

Status: Living document. Generated from a full-repository review on 2026-09-25.

## 75.1 Purpose

This document translates the roadmap in `06-roadmap-and-acceptance.md` and the
product vision in `01-product-vision.md` into an ordered, actionable task
backlog against the *current* state of the repository, so "production grade"
work can proceed phase by phase instead of as one undifferentiated effort.

## 75.2 Current state summary

**What exists today:**

- Rust workspace (`crates/core`, `crates/geometry`, `crates/reconstruction`,
  `crates/runtime`) — thin domain types only (441 LOC total): `AssetId`,
  `EvidenceState`, `Confidence`, `ProjectManifest`, `CapabilityProfile`,
  `ExecutionBackend`, `QualityTier`, `ResourceBudget`, `JobController`. No
  numerical/geometry algorithms, no WASM bindings, no `wasm-bindgen`/`wasm-pack`
  build target.
- TypeScript web app (`apps/web`) with:
  - Marketing page + Voxel Bloom brand system (`branding/`, `marketing/`).
  - Multipage Studio shell (Overview, Projects, Capture, Import, Preferences)
    with IndexedDB-backed local project storage (`storage/`, `studio/`).
  - A substantial hand-rolled visual-SLAM style pipeline implemented **entirely
    in TypeScript** under `capture/`: feature tracking, keyframes, pose
    estimation, triangulation, SE3, Jacobians, Schur-complement bundle
    adjustment, robust loss, temporal filtering, relocalization, live scan
    orchestration, worker-based reconstruction session.
  - An ML inference scaffold (`inference/`): engine registry, ONNX Runtime Web
    engine wrapper, worker runtime, capability detection, benchmarking
    harness, model cache/manifest validation — but **no shipped model
    manifest, no `models/` directory, no packaged weights**, so this is
    plumbing without a working model yet.
- CI runs Rust checks (fmt/check/test/clippy) and Web checks
  (typecheck/test/build) on every push/PR.
- `models/`, `packages/`, `benchmarks/`, `tools/` directories described in the
  README layout **do not exist yet**.

**Net assessment against the roadmap:** the project is midway through
*Phase 0 (Foundation)* and well into the capture/tracking slice of
*Phase 1/3*, but with an architecture inversion worth flagging explicitly:

> The architecture docs (`02-architecture.md`, `12-production-readiness...md`)
> specify Rust as the computational core with WASM as the execution target for
> geometry/reconstruction/numerical work. In practice, all of that numerical
> code (bundle adjustment, Schur solves, triangulation, SE3 math) has been
> built directly in TypeScript, and the Rust crates contain only plain data
> types. This is fine as a prototyping path, but it is a load-bearing decision
> that should be made explicit and ratified (or reversed) before more capture
> logic is added, because porting a working bundle-adjustment stack from TS to
> Rust/WASM later is expensive and risky.

There is no Avatar Studio, Scene Studio, Animation Studio, Render, or Export
surface yet — those are Phase 2, 4, 5, 6 and are entirely greenfield.

## 75.3 Decision required before proceeding (blocking)

**D1. Where does numerical reconstruction code live?**
- Option A: Keep it in TypeScript, drop the "Rust computational core" framing
  for reconstruction math, and scope Rust crates to schema/lifecycle/runtime
  only.
- Option B: Port the existing `capture/` numerical pipeline
  (bundle-adjustment, schur, triangulation, se3, jacobian, robust-loss,
  linear-solve) into `crates/geometry` + `crates/reconstruction`, expose it
  through a `wasm-bindgen` boundary, and make the TS files thin callers.
  This matches the stated architecture and the ADRs.

This choice changes the shape of nearly every task below, so it should be
resolved (with the user) before Phase 1 work continues. The rest of this
pipeline assumes **Option B** (matches the committed architecture docs);
tasks are flagged `[A-compatible]` where they hold either way.

## 75.4 Task pipeline

### Stage 0 — Close out Foundation (Phase 0)

1. Ratify decision D1; record it as a new ADR in `docs/07-architecture-decisions.md`.
2. Stand up the WASM bridge: `wasm-bindgen`/`wasm-pack` build for
   `crates/geometry` + `crates/reconstruction`, wired into `apps/web` via
   Vite, with a typed TS surface generated from Rust. `[A-compatible: skip if A]`
3. Create `packages/` workspace entries for anything shared between the WASM
   bridge and the web app (typed protocol definitions, schema types) so
   `pnpm-workspace.yaml`'s `packages/*` glob is populated instead of empty.
4. Create `models/` with a manifest schema (`21-model-registry-and-provenance.md`
   already specifies the contract) and wire `inference/manifest-validation.ts`
   against a real, checked-in manifest for at least one vision model.
5. Create `benchmarks/` with fixture format per `23-benchmark-contract.md` and
   `37-benchmark-harness.md`; migrate `capture/optimization-fixtures.ts` and
   `inference/benchmark*.ts` to read from it.
6. Create `tools/` for model packaging/verification scripts referenced by the
   model registry docs.
7. Add `cargo test --workspace` coverage for every public type in the four
   crates (currently thin; verify invariants like `Confidence::clamped`).
8. Confirm capability-profile visibility end-to-end (Rust `CapabilityProfile`
   → TS `capabilities.ts` → UI) with an integration test, per Phase 0
   acceptance criteria.

### Stage 1 — Migrate/port reconstruction core (if D1 = Option B)

Port in dependency order, each with unit tests ported/rewritten in Rust and
a thin TS wrapper replacing the current pure-TS implementation:

9. `se3.ts`, `distortion.ts`, `reprojection.ts` → `crates/geometry`.
10. `triangulation.ts`, `linear-solve.ts`, `sparse-normal-equations.ts` →
    `crates/geometry`.
11. `jacobian.ts`, `bundle-linearization*.ts`, `schur*.ts`,
    `robust-loss.ts` → `crates/reconstruction`.
12. `bundle-optimizer.ts`, `bundle-adjustment.ts`, `bundle-problem.ts`,
    `bundle-commit.ts` → `crates/reconstruction`, exposed as a job the
    `JobController` in `crates/runtime` drives.
13. Keep `capture/live-scan.ts`, `capture-pipeline.ts`, `keyframes.ts`,
    guidance/HUD code in TypeScript (UI/orchestration layer, not core math) —
    have them call into WASM instead of local pure-TS math.
14. Re-run the existing extensive `capture/*.test.ts` suite against the new
    WASM-backed implementations to confirm numerical parity (same fixtures,
    tolerance-based comparison) before deleting the pure-TS math.
15. Only delete the superseded pure-TS numerical files once parity tests are
    green in CI for at least one full run.

### Stage 2 — Phase 1: Image intake and analysis

16. Person detection + segmentation model integration through the existing
    `inference/` engine registry (first real model manifest from Stage 0.4).
17. Pose estimation (2D landmarks) and face landmark detection models.
18. Viewpoint classification (front/three-quarter/profile/back) built on top
    of pose/landmarks output.
19. Coverage report UI: per-viewpoint observed/missing/duplicate status, in
    the Studio import/capture routes.
20. Quality analysis: blur, exposure, occlusion checks (`inference/quality.ts`
    already has partial scaffolding — extend to the full contract in
    `24-accessibility-and-ux-foundation.md`/`32-adaptive-capture-guidance.md`).
21. Duplicate-angle detection using pose/viewpoint similarity.
22. Fixture-based test corpus + acceptance tests matching Phase 1's
    acceptance criteria verbatim (reject invalid images, identify useful
    views, flag missing viewpoints, explain low quality).

### Stage 3 — Phase 2: Single-image avatar

23. Coarse body shape estimation from a single image (model selection +
    integration, following `42-vision-model-selection.md`).
24. Monocular depth estimation integration.
25. Visible-geometry fitting against depth + body shape.
26. Hidden-geometry inference with explicit `EvidenceState`/`Confidence`
    tagging (already modeled in `crates/core`; wire it through the whole
    pipeline instead of leaving it a leaf type).
27. Confidence map renderer (observed/inferred visualization) in the Studio
    viewer.
28. Interactive 3D viewer (likely three.js/R3F per `12-production-readiness...md`)
    with pause/resume/cancel wired to `JobController`.
29. Model validation gate: reconstructed mesh passes topology/manifold checks
    before being marked usable.

### Stage 4 — Phase 3: Multi-view reconstruction

30. Multi-view camera pose estimation reusing the ported bundle-adjustment
    core from Stage 1.
31. Cross-view correspondence and fusion of single-image results.
32. Surface reconstruction from fused multi-view data.
33. Texture projection from source images onto the reconstructed surface.
34. Progressive refinement loop with intermediate-artifact caching
    (IndexedDB/OPFS, per `16-local-storage-contract.md`).
35. Contradictory/poor-view handling: confidence-weighted rejection instead
    of silent corruption, with tests proving it.

### Stage 5 — Phase 4: Production avatar asset

36. Mesh cleanup (non-manifold removal, decimation) and topology validation.
37. LOD generation.
38. Material/texture generation pipeline.
39. GLB/glTF export with the validation contract in
    `05-project-format-and-export.md`.
40. Project persistence: full save/reload round-trip test, schema version
    migration path exercised (`20-project-revision-model.md`).

### Stage 6 — Phase 5: Studio (Avatar/Scene/Animation editing)

41. Scene editor surface: environments, props, lighting, cameras, materials.
42. Avatar Studio surface: body/face/hair/clothing/material/proportion
    controls bound to the asset produced in Stage 5.
43. Pose editor + rig import/generation.
44. Timeline with keyframes, persisted to the project schema.
45. Still-image render pipeline matching viewport intent.

### Stage 7 — Phase 6: Video and motion

46. Offline frame scheduler decoupled from real-time frame rate.
47. Browser video encoding where available (WebCodecs), image-sequence
    fallback with reported codec limitations.
48. Webcam pose tracking → motion retargeting onto the rig.
49. Mocap start/stop without breaking scene state.

### Cross-cutting production gates (apply to every stage above)

Per `12.7 Production gates` and `06-roadmap-and-acceptance.md`, no task in
Stages 2-7 is "done" without, alongside the feature itself:

- automated unit + integration tests
- representative fixtures checked into `benchmarks/`
- malformed-input tests
- cancellation tests (via `JobController`)
- recovery/resume tests
- performance + memory benchmarks
- capability-fallback tests (WebGPU → WASM → CPU)
- security review for any new untrusted-input path
- licensing review for any new model/dependency
- documentation update in `docs/`
- schema/version bump if project data shape changes

### Compliance/legal track (parallel, not blocking early stages but blocking launch)

50. Provenance/labeling metadata architecture ahead of EU AI Act Article 50
    (2026-08-02 deadline) — needed once any generative/inferred visual output
    ships, so should land no later than Stage 3.
51. Privacy architecture review against India DPDP Rules 2025 phased
    commencement.
52. Confirm no biometric "unique identification" capability is being built
    (CCPA/ICO risk noted in `12.6`); document this explicitly for any pose/
    face-landmark feature added in Stage 2.
53. Model cards, benchmark results, known limitations, and failure cases
    published per model integrated (Stage 2 onward).

## 75.5 Suggested execution order

Stage 0 → D1 decision → Stage 1 (if Option B) → Stage 2 → Stage 3 → Stage 4 →
Stage 5 → Stage 6 → Stage 7, with the compliance track starting alongside
Stage 2 once any inferred/generated visual content exists, and cross-cutting
gates applied continuously rather than retrofitted.

This is a multi-quarter effort; treat each numbered task as a separately
reviewable PR-sized unit of work, not a single push.
