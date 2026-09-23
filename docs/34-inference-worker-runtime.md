# 34. Inference Worker Runtime

The inference worker now has a concrete lifecycle implementation rather than only a protocol definition.

## Lifecycle

```text
load -> ready -> run -> progress/result/error -> unload
                         ^
                         |
                      cancel
```

Loaded models are tracked by immutable model keys. Jobs referencing an unloaded model fail explicitly.

## Honest capability reporting

The worker currently stops at `RUNTIME_UNAVAILABLE` because no concrete inference engine is bundled yet. This is intentional: the worker must never manufacture an inference result.

## Cancellation

Cancellation is represented explicitly and checked before execution. Future backend adapters should also propagate cancellation into the underlying runtime when supported.

## Next runtime gate

A real backend integration must provide:

- model loading from verified bytes
- actual tensor/input conversion
- inference execution
- transferable result handling
- backend-specific resource release
- measured latency and memory telemetry
- deterministic error mapping

Only after those gates pass should local AI signals drive capture guidance.
