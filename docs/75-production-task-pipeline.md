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
3. **Deliberately still empty.** `packages/README.md` documents why:
   nothing to share yet — a shared package boundary only earns its keep once
   a second app surface (or generated WASM-bridge types) needs one. Not a
   gap; revisit when Stage 5/6 adds a second surface.
4. **Done.** `models/movenet-singlepose-lightning/manifest.json` — real,
   checked-in, `approvalStatus: "candidate"` — validated by
   `inference/model-registry-manifest.ts`.
5. **Done.** `benchmarks/fixtures/bundle-adjustment-synthetic-v1.json` — the
   first real fixture, loaded by `capture/optimization-fixtures.ts`'s
   `loadSyntheticOptimizationFixture()` (replacing the old hardcoded-in-TS
   generator, which had zero callers). `inference/benchmark-record.ts` adds
   `createBenchmarkRecord`, formatting every reproducibility field
   `docs/23-benchmark-contract.md` requires (benchmark/fixture id+version,
   Veylune/engine version, model ids/digests, runtime, backend, quality
   tier, date) and the `records/` naming convention — it doesn't write a
   file automatically, since nothing runs a real model benchmark yet (no
   approved model — see task 4's `approvalStatus`); that's the harness
   ready for the first real run, not a fabricated one.
6. **Done** (already existed before this pass) — `tools/verify-model-digest.mjs`
   checks a downloaded artifact's sha256 against its manifest's
   `artifactDigest`.
7. **Done.** Audited all public types across the four crates; the real gap
   was `JobController` (7 public methods, 3 tests) — `release()`,
   `fail()`, `request_cancel()` from `Queued`, `complete_step()`'s
   `Cancelled` branch, and `reserve()`'s budget-exceeded path all had zero
   coverage. Added 6 tests closing each. Plain data/enum types
   (`AssetId`, `EvidenceState`, `GeometryQuality`, `JobState`,
   `RuntimeError`) have no logic to invariant-test beyond construction —
   not a coverage gap.
8. **Done.** Capability-profile visibility end-to-end (Rust `CapabilityProfile`
   → `preferred_backend` → DOM attribute) — `main.ts`'s wiring was already
   correct but untested (an entry script running on import is awkward to
   exercise directly); extracted into `engine/capability-attributes.ts`'s
   `applyEngineCapabilityAttributes`, which `main.ts` now calls, with
   `capability-attributes.test.ts` proving the full chain against a real
   loaded engine and a real `HTMLElement` (no mocks).

### Stage 1 — Migrate/port reconstruction core (if D1 = Option B)

**D1 is resolved: Option B (see ADR-013).** Progress below as of 2026-09-28.

Port in dependency order, each with unit tests ported/rewritten in Rust and
a thin TS wrapper replacing the current pure-TS implementation:

9. **Ported** — `se3.ts`, `distortion.ts`, `reprojection.ts` →
   `crates/geometry/src/{se3,distortion,reprojection}.rs`, exposed through
   `crates/wasm-bridge`, with parity tests
   (`capture/se3-wasm-parity.test.ts`,
   `capture/distortion-reprojection-wasm-parity.test.ts`) proving the Rust
   and TS implementations agree. Per task 15, the TS files are **not yet
   deleted** — they stay the shipped path until parity has run green in CI
   for a real stretch, not swapped in the same change that ported them.
10. **Ported** (same status as above) — `triangulation.ts` (per-point core
    only; the match-list loop stays TS orchestration, see
    `crates/geometry/src/triangulation.rs`'s module doc), `linear-solve.ts`,
    `sparse-normal-equations.ts` → `crates/geometry`, with parity tests
    (`capture/triangulation-wasm-parity.test.ts`,
    `capture/linear-solve-wasm-parity.test.ts`,
    `capture/sparse-normal-equations-wasm-parity.test.ts`).
11. **Ported** (shipped-path modules; see below for what was deliberately
    skipped and why) — `robust-loss.ts` → `crates/reconstruction/src/robust_loss.rs`,
    the shipped `schur-block-solve.ts` (the module `bundle-optimizer.ts`
    actually calls) → `crates/reconstruction/src/schur_block_solve.rs`, and
    `bundle-linearization.ts`'s per-observation core (`linearizeObservation`;
    the `BundleProblem`-loop wrapper `linearizeBundle` stays TS
    orchestration) → `crates/reconstruction/src/bundle_linearization.rs`.
    Parity tests: `capture/robust-loss-wasm-parity.test.ts`,
    `capture/schur-block-solve-wasm-parity.test.ts`,
    `capture/bundle-linearization-wasm-parity.test.ts`. Explicitly **not**
    ported, with reasons recorded in `schur_block_solve.rs`'s module doc:
    - `jacobian.ts`'s `finiteDifferenceJacobian` — a test-only numerical
      utility (no production caller) taking an arbitrary JS residual
      closure; porting it would mean Rust calling back into JS through the
      WASM boundary for a function nothing ships with.
    - `schur.ts`'s `prepareSchurSystem` — no production caller, and its own
      success path returns `status: "singular"` unconditionally (apparent
      dead code with a latent bug, not this port's job to carry forward).
    - `schur-blocks.ts`/`schur-backsubstitution.ts` — a second, factored
      Schur implementation exercised only by `bundle-linearization.test.ts`/
      `numerical.test.ts` as a cross-check, not the shipped path. Worth
      porting later if that cross-check is judged worth keeping in Rust
      too, but it doubles this task's surface for no shipped-path benefit
      today.
12. **Numerical core ported; job-driven wiring not started.** The pure math
    inside `bundle-optimizer.ts`/`bundle-adjustment.ts` → `crates/reconstruction/src/bundle_optimizer.rs`:
    `predictReduction`, `bundleCost`'s per-residual accumulation (factored to
    take residuals/weights rather than a `BundleProblem`), `clampVector`,
    and `prepareBundleAdjustment`'s threshold check. Parity test:
    `capture/bundle-optimizer-wasm-parity.test.ts` (against the real,
    now-exported `predictReduction`/`bundleCost`/`clampVector` in
    `bundle-optimizer.ts`, not a reimplementation). **Not** ported:
    - `optimizeBundle` itself — the Levenberg-Marquardt iterate/accept-reject
      loop, damping schedule, and `shouldCancel`/`onProgress` callbacks. This
      is the "expose as a job the `JobController` drives" half of this task
      and is a materially bigger, riskier change (callback marshaling across
      the WASM boundary, or restructuring the loop to poll instead of push)
      than every prior Stage 1 slice — deliberately not attempted without
      first scoping it on its own.
    - `bundle-problem.ts`'s `computeBundleResiduals`/`projectWorldPoint` —
      string-`id` `Map`-lookup orchestration; its inner per-point math is
      already covered 1:1 by the already-ported `project_distorted_point`
      (`distortion.rs`).
    - `bundle-commit.ts` — a `LocalMap` transaction/merge policy, i.e.
      state management, not math; same category as `capture-pipeline.ts`.
13. **First live caller swapped.** Prerequisite: the reconstruction worker
    needed to actually load the engine — it didn't; only `main.ts` (for the
    capability-display DOM attribute) and test files called `loadEngine()`.
    Added `reconstruction-engine-bootstrap.ts`'s `ensureReconstructionEngineReady()`
    (fire-and-forget from `reconstruction-worker-entry.ts` at worker
    startup, non-blocking) and its synchronous companion
    `isReconstructionEngineReady()` for call sites that can't await.
    `reconstruction-engine-bootstrap.test.ts` proves the capability-fallback
    contract: a failed load resolves `false` rather than throwing/hanging,
    repeated calls are idempotent.

    With that in place, `bundle-optimizer.ts`'s Schur-solve step —
    called once per Levenberg-Marquardt iteration, not once per point, so
    marshaling overhead is negligible — now routes to
    `engineSolveBundleSchurBlocks` whenever `isReconstructionEngineReady()`
    is true, falling back to the pure-TS `solveBundleSchurBlocks` otherwise.
    `predictReduction`'s per-iteration call (the LM gain-ratio estimate) is
    routed the same way, through a `predictReductionRouted` wrapper —
    `predictReduction` itself stays the plain TS export the parity test
    calls directly. `bundle-optimizer-engine-swap.test.ts` runs the **real**
    synthetic bundle-adjustment convergence scenario (the same fixture
    `bundle-optimizer.test.ts` uses for the TS-only path) with the engine
    loaded, proving the live optimizer still converges through both routed
    WASM calls — not just a call-by-call parity check.

    The remaining risk — `clampVector`/`applySE3Increment` called once **per
    landmark/camera** in `applyBundleStep`, proportional to map size — was
    resolved by batching rather than left unrouted: added
    `apply_camera_steps`/`apply_landmark_steps` to
    `crates/reconstruction/src/bundle_optimizer.rs`, each taking every
    camera's (or landmark's) current state and step at once and returning
    every update at once, so the *WASM call count* per iteration stays O(1)
    (two calls total) regardless of how many landmarks a real capture has
    (thousands). `bundle-step-wasm-parity.test.ts` proves the batched
    result matches the per-item TS math; `applyBundleStepRouted` in
    `bundle-optimizer.ts` calls the batched functions when the engine is
    ready, zipping the non-fixed-camera subset and full landmark list back
    into the `BundleProblem` shape positionally (no `indexOf` needed — both
    orderings are already guaranteed by how `linearizeBundle` builds
    `cameraIds`/`landmarkIds` from the same `problem`). The engine-swap
    end-to-end test now exercises all three routed calls
    (Schur-solve, predict-reduction, step-application) together.

    `bundleCost` is now routed too, via `bundleCostRouted`: computes
    residuals with the (unchanged, TS) `computeBundleResiduals` Map-lookup
    loop, then hands the flat residual/weight arrays to the already-existing
    `engineBundleCost` in one call — the "restructure the loop to hand off
    flat arrays first" step this previously needed turned out to be a small
    `.map()` at the call site, not a rewrite of `computeBundleResiduals`
    itself. `bundleCost` (the plain export) is untouched and still used by
    the fallback path and the parity test. The engine-swap end-to-end test
    now exercises all **four** routed calls together (Schur-solve,
    predict-reduction, step-application, cost evaluation).

    `linearizeObservation` is routed too, closing out the last item this
    task's notes flagged as needing its own batched entry point.
    `linearize_observations` (`bundle_linearization.rs`) batches the
    already-existing `linearize_observation` over a whole observation list
    — same rationale as the camera/landmark step batching above, since a
    real capture can have hundreds of observations per iteration.
    `bundle-linearization-batch-wasm-parity.test.ts` proves it against a
    mixed fixture (two cameras, one fixed, one free, real distortion, one
    behind-camera landmark to exercise the invalid path). `linearizeBundleRouted`
    in `bundle-linearization.ts` keeps the `camera`/`landmark` `Map` lookups
    and id-reattachment exactly as `linearizeBundle` does — only the
    per-observation math moves to the single batched WASM call.
    `bundle-optimizer.ts` now calls `linearizeBundleRouted`.

    **All five per-iteration/per-call-site math functions in the LM loop
    are now routed** (Schur-solve, predict-reduction, step-application,
    cost evaluation, linearization), each falling back to its pure-TS
    counterpart when the engine isn't ready. The engine-swap end-to-end
    test exercises all five together and the optimizer still converges.

    **The tracking pipeline (`capture-pipeline.ts`) is now routed too**,
    separately from the bundle-adjustment loop above — a different pipeline
    (per-frame tracking, not per-LM-iteration optimization) with its own
    prerequisite and call-frequency shape:

    - **Prerequisite:** `isReconstructionEngineReady()` previously tracked
      its own `ready` boolean, set only by `ensureReconstructionEngineReady()`
      — which nothing on the main thread called. `main.ts` loads the engine
      independently (for the capability-display attribute) via the same
      underlying `engine/index.ts` module, so that load was invisible to
      `isReconstructionEngineReady()`. Fixed by making `engine/index.ts`
      export `isEngineLoaded()` as the actual source of truth and having
      `isReconstructionEngineReady()` delegate to it — a load from *any*
      caller in a module instance is now visible to every other caller in
      that instance. `capture-app.ts`'s `mountCaptureApp` also now calls
      `ensureReconstructionEngineReady()` itself (idempotent, fire-and-forget)
      so it doesn't implicitly depend on `main.ts`'s wiring order.
    - **Batched triangulation:** `triangulate_points` (`crates/geometry/src/triangulation.rs`)
      batches the already-existing `triangulate_point` over a whole match
      list — same rationale as the bundle-adjustment batching, since
      `triangulateCorrespondences` runs on **every processed frame**, not
      just keyframe insertions (its result is computed before the
      keyframe-insert decision, then only used if `insert` is true).
      `triangulate_points_wasm`'s output packs `valid` first per row so a
      rejected match's other four floats can be read as `0` without a
      separate pass. `triangulation-batch-wasm-parity.test.ts` proves it
      against a mixed fixture (real parallax + forced zero-parallax
      rejections in the same match list).
    - **Finding, not a ported-code bug:** building that parity test's pixel
      fixtures surfaced that `triangulateCorrespondences`'s `unprojectRay`
      treats `CameraPose.translation` as the camera's world-space *center*
      (ray origin = translation directly; its own reprojection check computes
      `R·(X − translation)`), which is a different convention from
      `reprojection.ts`'s `projectPoint` (`X_cam = R·X + t`, standard
      world-to-camera translation) — the same field name, two incompatible
      meanings depending which file reads it. The original
      `triangulation-wasm-parity.test.ts` (written two turns ago) had
      silently used the wrong convention for its fixture, which meant every
      iteration rejected every point and its assertion block was dead code
      (`false === false`, never entered) — a passing test providing zero
      real coverage. Both test files now project with the convention
      `triangulateCorrespondences` actually implements, and
      `triangulation-wasm-parity.test.ts` asserts `acceptedCount > 0` so
      that gap can't reopen silently. **Fixed** (ADR-014,
      `docs/07-architecture-decisions.md`): audited every consumer —
      `local-pose-estimator.ts`'s `composePose` accumulates poses by plain
      world-frame addition and `essential-matrix.ts` names the field
      `C1`/`C2`, both confirming the camera-center convention is the one
      the real, live tracking pipeline actually produces and expects.
      `reprojection.ts`, `bundle-problem.ts`, and `bundle-linearization.ts`
      (plus their Rust ports) were the ones using the wrong
      standard-`t` convention and have been corrected to match — see the
      ADR for the exact formula/Jacobian/update-rule fixes and the affected
      test fixtures.
    - `triangulateCorrespondencesRouted` in `triangulation.ts` keeps the
      `reference[match.referenceIndex]`/`current[match.currentIndex]`
      lookup-and-skip step exactly as `triangulateCorrespondences` does;
      only the per-match math moves to the one batched call.
      `capture-pipeline.ts` now calls it.
      `capture-pipeline-engine-swap.test.ts` runs the real
      `CapturePipeline.process()` path end to end with the engine loaded,
      proving the same landmark/observation counts as the TS-only test.

    **`assembleBundleBlocks` — the single most expensive per-observation
    step in the whole LM loop (an outer-product Hessian/gradient
    accumulation) — is routed too.** `assemble_bundle_blocks`
    (`crates/reconstruction/src/bundle_block_assembly.rs`) batches it the
    same way as `linearize_observations`: one WASM call for the whole
    observation list. `bundle-block-assembly-wasm-parity.test.ts` proves
    the batched result against a mixed fixture (two free cameras, one
    fixed camera, one filtered-invalid observation).
    `assembleBundleBlocksRouted` in `bundle-block-assembly.ts` keeps the
    `cameraIndex`/`landmarkIndex` `Map` lookups exactly as before;
    `bundle-optimizer.ts` now calls it.

    **Fixed-camera bug found during this port, then fixed (not left as a
    quirk):** the TS loop originally skipped an observation entirely (no
    landmark Hessian contribution either) whenever its camera had no index
    in the caller's camera list — which included every **fixed** camera,
    not just a genuinely missing one, since `cameraIds` only contains
    non-fixed cameras. A landmark seen by a fixed anchor plus free cameras
    lost the anchor's contribution to its own optimization. Flagged to the
    user, who asked for it to be fixed now: the camera block/gradient
    still skips fixed cameras (correct), but the landmark block/gradient
    now accumulates for every valid observation regardless. Fixed in both
    `bundle-block-assembly.ts` and the Rust port — see ADR-014's follow-up
    note in `docs/07-architecture-decisions.md` for the exact write-up.

    **`bundleCostRouted` still called the pure-TS `computeBundleResiduals`
    even when the engine was ready** — its own per-observation `projectWorldPoint`
    loop was never routed. Fixed with zero new Rust: the residual it needs
    is exactly `linearizeObservation`'s `residual` field (same `q = R*(P -
    C)` projection), so `computeBundleResidualsRouted`
    (`bundle-problem.ts`) reuses the already-batched
    `engineLinearizeObservations` and discards the Jacobians it also
    computes, instead of adding a near-duplicate batched export for a
    strictly cheaper subset of the same math. `bundle-residuals-wasm-parity.test.ts`
    proves it against a mixed fixture (two cameras, a missing-camera
    observation, a behind-camera landmark).

    **All six per-iteration/per-observation-batch functions in the LM loop
    are now routed, with every observation-level projection going through
    WASM when the engine is ready** (Schur-solve, predict-reduction,
    step-application, cost evaluation — now genuinely engine-backed, not
    just its final summation — linearization, block assembly). The
    engine-swap end-to-end test exercises the core five together and the
    optimizer still converges; audited every remaining production consumer
    of every ported function (`HuberLoss`, `solvePositiveDefinite`,
    `applySE3Increment`/`so3Exp`, `projectDistortedPoint`) and found no
    other unrouted call site. `accumulateNormalEquations`
    (`sparse-normal-equations.ts`) has **zero** production consumers
    anywhere — ported and parity-tested, but genuinely unused; nothing to
    route.

    `capture/live-scan.ts`, `keyframes.ts`, and guidance/HUD code are
    orchestration, not math — nothing there to route.
14. **Done, 2026-09-28.** Ran the entire `capture/*.test.ts` suite (all 70
    test files, 309 tests — not just the targeted `*-engine-swap.test.ts`
    files) with the engine force-loaded globally in `test-setup.ts`
    (temporary, reverted immediately after — not a permanent change,
    since other tests intentionally rely on the engine being unloaded to
    exercise the TS fallback path). All 309 passed with the WASM-routed
    path active wherever `isReconstructionEngineReady()` gates it,
    confirming numerical parity across the whole suite, not just the
    hand-picked coverage.
15. **Not yet — correctly still gated.** Nothing has run in CI yet (no
    commits pushed), so "green in CI for at least one full run" hasn't
    happened. Do not delete the superseded pure-TS files until it has —
    they also remain the fallback path every routed function needs when
    the engine fails to load, so "superseded" only applies once a
    caller-side fallback strategy replaces that role too, which hasn't
    been decided.

### Stage 2 — Phase 1: Image intake and analysis

16. Person detection + segmentation model integration through the existing
    `inference/` engine registry (first real model manifest from Stage 0.4).
17. **Groundwork started, 2026-09-28.** Pose estimation (2D landmarks)
    first real verification: `tools/verify-model-inference.mjs` downloads
    (not committed — digest-checked), loads, and actually runs
    `models/movenet-singlepose-lightning/manifest.json`'s artifact through
    `onnxruntime-web`'s Node/WASM backend. Found and fixed a wrong manifest
    field in the process: the input dtype was guessed as `uint8` from the
    published spec without running the artifact; the real graph rejects
    that and requires `int32`. Real (Node dev-machine, not target-device)
    latency captured as this repo's first actual benchmark record,
    `benchmarks/records/movenet-singlepose-lightning-inference-2026-09-28-0.1.0.json`
    (~255ms session create, ~46ms/inference steady state).

    **Integration gap found, then closed the same session.**
    `inference/onnx-engine.ts`'s `OnnxInferenceEngine` and
    `inference/engine.ts`'s `TensorInput` were hardcoded to `Float32Array`
    only; `inference/vision/preprocess.ts`/`vision/manifest.ts` assumed
    NCHW float32 input — this model is NHWC `int32`. Both widened
    (`TensorInput.dtype`, `VisionModelManifest.input.layout`, a new
    `rgbaToNhwcTensor` alongside the existing `rgbaToNchwTensor`) — safe to
    do without a live-behavior check because `OnnxInferenceEngine`,
    `TensorInput`, and `VisionModelManifest` had **zero production
    consumers** anywhere in the app before this, confirmed by grep.
    `onnx-engine-movenet.test.ts` proves the widened engine actually loads
    and runs this model's real weights end to end (not just raw
    `onnxruntime-web`, which `tools/verify-model-inference.mjs` already
    covered) — real digest-checked artifact, real inference, output shape
    `[1,1,17,3]`, all finite. Needed one more fix along the way: this
    project's default jsdom test environment can't run
    `onnxruntime-web`'s Node backend (a cross-realm `Buffer` check fails),
    so this test opts into `// @vitest-environment node`, which required
    guarding `test-setup.ts`'s `HTMLCanvasElement` patch (absent outside
    jsdom) — see that file. `approvalStatus` stays `"candidate"`: operator
    support (both raw and through this app's own engine) is now verified,
    but device/browser latency and quantization-accuracy comparison are
    still not.
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
