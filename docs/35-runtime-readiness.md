# 35. Runtime Readiness

Veylune now exposes explicit inference-runtime capability state and validates model manifests before activation.

## Runtime selection

The application can distinguish whether WebGPU, WebNN and WebAssembly are available on the current browser/device. Backend selection remains constrained by both runtime capability and the model manifest.

## Model validation

Before a model can be activated, its manifest must provide:

- stable model ID
- version
- SHA-256 artifact digest
- license
- input schema
- output schema
- at least one declared execution backend

Malformed manifests are rejected before model bytes reach an execution runtime.

## No false readiness

A browser advertising WebGPU does not mean a particular model/runtime is ready. Runtime readiness has separate gates:

```text
browser capability
      +
model manifest compatibility
      +
artifact integrity
      +
concrete runtime adapter
      +
benchmark/compatibility validation
      =
production-ready inference
```

This distinction is important for mobile browsers, where API availability can differ from practical model performance.

## Next gate

The next implementation should integrate a maintained inference runtime behind `InferenceRuntimeAdapter`, using only current compatible package versions, and add device/browser benchmark fixtures before enabling realtime model-driven capture guidance by default.
