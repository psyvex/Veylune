# 38. Inference Engine Boundary

The inference architecture now has a concrete tensor-level engine boundary without coupling Veylune to a specific vendor or package.

## Contract

An engine must expose:

- a declared execution backend
- model loading from verified bytes
- tensor input/output with explicit shapes
- asynchronous execution
- resource release

`EngineRuntimeAdapter` converts this engine contract into the application-level inference runtime contract.

## Why this boundary exists

The application should not depend directly on a particular inference library. This keeps browser capability detection, model manifests, caching, benchmarking and capture orchestration independent from the execution implementation.

## Production requirements

A concrete engine implementation must additionally provide:

- supported operator coverage for the selected model
- correct tensor layout and datatype handling
- cancellation or cooperative interruption where supported
- bounded GPU/CPU memory use
- reproducible model/version identity
- benchmark results on representative browsers/devices
- license compatibility documented in the model/runtime record

## Current state

This commit intentionally adds the interface and adapter only. No fake tensor inference is enabled. The next implementation can plug in a maintained runtime while preserving all existing readiness and benchmark gates.
