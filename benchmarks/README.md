# Benchmarks

Performance and quality benchmark fixtures and records, per the contract in
`docs/23-benchmark-contract.md`.

- `fixtures/` holds synthetic or licensed input fixtures (never production user
  photographs) referenced by `apps/web/src/capture/optimization-fixtures.ts` and the
  inference benchmark harness in `apps/web/src/inference/benchmark-harness.ts`.
- `records/` holds append-only benchmark result records: one JSON file per run, named
  `<benchmarkId>-<date>-<engineVersion>.json`, matching the reproducibility fields the
  contract requires (benchmark ID/version, fixture version, Veylune version, engine
  version, model IDs/digests, browser/runtime, execution backend, quality tier, date).

No result record is a release gate on its own; the regression policy in the contract
decides when a delta blocks a release.
