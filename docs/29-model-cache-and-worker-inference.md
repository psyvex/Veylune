# 29. Model Cache and Worker Inference

The client inference foundation now includes persistent model caching and an isolated worker protocol.

## Model cache

`ModelCache` provides a browser-independent persistence boundary. `IndexedDbModelCache` is the initial persistent implementation and `MemoryModelCache` provides deterministic tests/fallback behavior.

Cache keys include model ID, version and artifact digest, preventing mutable model bytes from silently replacing a previously cached artifact.

## Activation

A model must pass both checks before activation:

1. a compatible local execution backend exists
2. the artifact SHA-256 matches the manifest digest

The model manager never treats a successful download/cache write as proof of integrity.

## Worker boundary

Inference requests use transferable-friendly `ArrayBuffer` payloads and are designed to run outside the UI thread.

The protocol supports:

- load
- run
- progress
- cancellation
- unload
- structured errors

The worker owns model execution resources. The application owns lifecycle policy and project persistence.

## Memory policy

Models should be unloaded when no longer needed. Persistent cache retention and runtime residency are separate concerns: cached bytes may remain on disk while GPU/CPU runtime resources are released.

## Next step

The next layer should connect this protocol to an actual inference runtime adapter and then integrate frame-quality inference into the camera scan pipeline. A concrete model should only be added after its license, digest, benchmark behavior and supported browser runtimes are recorded.
