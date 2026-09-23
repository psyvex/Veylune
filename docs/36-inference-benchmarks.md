# 36. Inference Benchmarks

Veylune now has a local benchmark contract and an explicit readiness gate.

## Measurements

The benchmark summary records successful inference durations and reports p50/p95 latency. Samples retain backend, model and coarse device-class identity for local comparison.

## Activation policy

A model/backend pair is not considered ready merely because:

- the browser exposes the API
- the model manifest is valid
- the artifact digest is valid

A benchmark result is also required before realtime model-driven capture guidance is enabled by default.

## Privacy

Benchmark records are runtime diagnostics. They should remain local unless a future, explicit diagnostics feature obtains user consent for telemetry.

## Next integration

The next implementation should add a concrete maintained inference runtime adapter and a small benchmark fixture that exercises the exact input/output tensor contract of the selected model. Readiness should then use those measured results rather than a manually supplied boolean.
