# 37. Benchmark Harness

The inference layer now has a repeatable local benchmark harness for validating concrete runtime adapters.

## Harness behavior

The harness executes a supplied inference operation a configurable number of times and records:

- backend
- model ID
- coarse device class
- execution duration
- success/failure

The resulting samples feed the existing p50/p95 summary and readiness gate.

## Production use

Benchmarks must use the same input schema and runtime configuration intended for realtime capture. A benchmark of a synthetic or differently shaped workload is not sufficient evidence for enabling realtime inference.

Benchmark runs should be performed locally and should not transmit camera frames or project assets.

## Failure behavior

Failed runs are retained as benchmark failures rather than being silently excluded from the sample set. This makes unstable runtimes visible when comparing devices or backends.

## Next gate

A concrete maintained inference engine can now be integrated behind the existing runtime adapter and exercised by this harness. Only measured results should move a model/backend pair from `benchmark_required` to ready.
