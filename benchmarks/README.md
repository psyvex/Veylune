# Benchmarks

Performance and quality benchmark fixtures and records, per the contract in
`docs/23-benchmark-contract.md`.

- `fixtures/` holds synthetic or licensed input fixtures (never production user
  photographs). `bundle-adjustment-synthetic-v1.json` is the first real one — a
  two-camera, four-landmark synthetic bundle-adjustment problem, loaded by
  `apps/web/src/capture/optimization-fixtures.ts`'s `loadSyntheticOptimizationFixture()`
  (Node-only tooling, not the shipped bundle). The inference benchmark harness in
  `apps/web/src/inference/benchmark-harness.ts` has no fixture yet — nothing in
  `apps/web/src/inference/` runs a real model to benchmark until Stage 2 lands one
  (see `docs/75-production-task-pipeline.md`).
- `records/` holds append-only benchmark result records: one JSON file per run, named
  `<benchmarkId>-<date>-<engineVersion>.json`, matching the reproducibility fields the
  contract requires (benchmark ID/version, fixture version, Veylune version, engine
  version, model IDs/digests, browser/runtime, execution backend, quality tier, date).
  `movenet-singlepose-lightning-inference-2026-09-28-0.1.0.json` is the first real one —
  produced by `tools/verify-model-inference.mjs` actually loading and running the
  downloaded (digest-checked, not committed) MoveNet artifact through
  `onnxruntime-web`'s Node/WASM backend. It's a developer-machine number, not a
  target-device/browser benchmark — see its own `notes` field and
  `models/movenet-singlepose-lightning/model-card.md`.

No result record is a release gate on its own; the regression policy in the contract
decides when a delta blocks a release.
