# 23. Benchmark Contract

## Goal

Performance and reconstruction quality must be measured continuously rather than judged from demos.

## Benchmark dimensions

### Runtime

- cold startup
- warm startup
- WASM initialization
- model load time
- job scheduling latency
- CPU time
- GPU time
- peak memory
- peak GPU memory where measurable
- storage consumption

### Reconstruction

- geometry error against reference where available
- landmark error
- silhouette overlap
- texture quality
- missing/incorrect-region rate
- confidence calibration
- failure rate

### UX

- time to first useful preview
- progress update latency
- cancellation latency
- recovery time
- export time

## Device classes

Benchmarks should cover representative low, medium and high capability devices rather than only a developer workstation.

## Reproducibility

Each benchmark record includes:

- benchmark ID/version
- fixture version
- Veylune version
- engine version
- model IDs/digests
- browser/runtime
- execution backend
- quality tier
- date

Hardware identifiers should be minimized in stored records.

## Regression policy

A performance or quality regression must be investigated before a release when it exceeds the subsystem's documented tolerance.

Benchmarks should distinguish expected variance from deterministic regressions.

## Privacy

Benchmark fixtures must be synthetic, licensed, consented, or otherwise approved for the intended use. Production user photographs must never silently become benchmark data.
