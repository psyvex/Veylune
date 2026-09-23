# 39. Inference Engine Registry

Veylune now has an explicit registry for concrete inference engines.

## Purpose

The registry keeps engine selection independent from model manifests, browser capabilities and capture orchestration. An engine factory declares:

- execution backend
- runtime identifier
- asynchronous engine creation

Only one factory may be registered for a backend in a given runtime.

## Security and compatibility

Registration does not imply production readiness. A registered engine still has to pass model compatibility, artifact integrity and benchmark gates before it can influence realtime capture.

Runtime identifiers provide provenance for diagnostics and benchmark records.

## Package policy

The repository does not silently pin or introduce an unverified inference package through this abstraction. A concrete dependency should be added only after checking its current compatible release, browser support, licensing, bundle size, security posture and model operator coverage.

## Next integration

The next implementation can register a maintained WebGPU/WASM engine behind this interface and connect its tensors to the worker runtime without changing the higher-level capture architecture.
