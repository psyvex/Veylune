# 33. Worker Telemetry and Inference Runtime Adapters

The browser foundation now has explicit runtime telemetry and an inference adapter boundary.

## Worker telemetry

`WorkerTelemetryStore` keeps transient local execution state:

- queue depth
- processing latency
- completed jobs
- failed jobs
- coarse memory pressure

This data is intended for local adaptive scheduling. It is not analytics telemetry and must not be uploaded by default.

## Runtime adapter

`InferenceRuntimeAdapter` separates model lifecycle from a concrete inference engine. A runtime adapter is responsible for loading, executing and unloading model resources.

The current fallback adapter deliberately reports an unavailable backend rather than pretending to execute a model. This keeps unsupported builds honest while preserving the production interface for WebGPU/WASM runtime implementations.

## Integration rule

A concrete runtime must:

1. verify the model artifact digest
2. validate the model manifest
3. expose only the declared backend
4. support cancellation where the underlying runtime permits it
5. release resources on unload
6. return model ID/version/backend provenance with results

## Adaptive loop

```text
worker events
   -> telemetry store
   -> capture policy
   -> scheduler
   -> bounded inference workload
```

The feedback loop is local and transient. It must not modify committed project state.

## Production gate

No fake inference implementation is permitted. A real runtime adapter should be introduced only with a compatible, actively maintained inference engine and a benchmarked model artifact.
