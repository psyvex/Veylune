# 6. Roadmap and Acceptance Criteria

## Phase 0 — Foundation

### Deliverables

- repository/toolchain
- Rust workspace
- Next.js application shell
- WASM boundary
- worker architecture
- project ID/schema foundation
- logging/error model
- capability detection
- CI
- unit/integration test harness

### Acceptance

- clean install on supported development platforms
- Rust tests run independently
- web app starts
- WASM module loads
- capability profile is visible
- no heavy work occurs on the UI thread

## Phase 1 — Image intake and analysis

### Deliverables

- upload
- image normalization
- quality analysis
- person detection
- segmentation
- pose
- face landmarks
- viewpoint classification
- coverage report

### Acceptance

Given a small test corpus, the application:

- rejects invalid images cleanly
- identifies useful views
- identifies obvious duplicates
- identifies missing major viewpoints
- explains why a photo is low quality

## Phase 2 — Single-image avatar

### Deliverables

- coarse body representation
- depth
- visible geometry fitting
- hidden geometry inference
- confidence map
- interactive viewer

### Acceptance

- one acceptable full-body image produces a valid model
- inferred regions are marked
- reconstruction can be cancelled
- model survives validation
- viewer remains responsive

## Phase 3 — Multi-view reconstruction

### Deliverables

- multi-view camera estimation
- correspondence/fusion
- surface reconstruction
- texture projection
- refinement
- progressive results

### Acceptance

- adding useful views measurably improves coverage
- back/side views reduce inferred regions
- poor/contradictory views do not silently corrupt the model
- intermediate artifacts can be reused

## Phase 4 — Production avatar asset

### Deliverables

- cleanup
- topology validation
- LODs
- material generation
- exportable GLB
- project persistence

### Acceptance

- generated assets pass automated validation
- reload reproduces the project state
- export/import round trip is stable

## Phase 5 — Studio

### Deliverables

- scene editor
- lighting
- camera
- materials
- pose
- animation
- timeline
- image rendering

### Acceptance

- user can create a scene without leaving the browser
- timeline edits persist
- still export matches viewport intent

## Phase 6 — Video and motion

### Deliverables

- offline frame scheduler
- browser video encoding where available
- image sequence fallback
- webcam pose tracking
- motion retargeting

### Acceptance

- animation can be rendered without relying on real-time frame rate
- export reports codec limitations
- mocap can be started/stopped without breaking the scene

## Phase 7 — Advanced creative systems

Potential:

- clothing simulation
- hair simulation
- facial animation
- procedural motion
- AI-assisted scene generation
- advanced materials
- physics
- environment generation
- asset library

These are deliberately deferred until the foundation is stable.

## Quality gates

A phase is not complete merely because a demo works.

Every phase requires:

- automated tests
- representative fixtures
- memory profiling
- performance profiling
- failure-path testing
- cancellation testing
- capability fallback testing
- documentation update
- versioned schema changes

## Definition of production-ready

The core product should:

1. never require photo upload to a server for the default workflow
2. clearly communicate uncertainty
3. survive malformed inputs
4. recover from cancellable failures
5. preserve projects
6. validate exported assets
7. avoid blocking the UI during expensive processing
8. provide capability-aware fallbacks
9. have reproducible test fixtures
10. maintain versioned project/pipeline metadata
