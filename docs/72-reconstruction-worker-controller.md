# Reconstruction Worker Controller

The reconstruction controller snapshots the current reconstruction state, submits that immutable snapshot to a dedicated worker, and commits the worker candidate only through `ReconstructionStateStore` using the snapshot's map and pose versions.

This gives the worker no authority to mutate application state. A result is accepted only when both versions still match the versions captured before submission. Concurrent edits therefore turn a worker result into a stale result instead of overwriting newer state.

The worker entrypoint is `reconstruction-worker.entry.ts`. Numerical optimization runs in `reconstruction-worker.ts`; transport remains responsible only for job lifecycle and message delivery.

Cancellation is lifecycle-safe at the transport/controller boundary. Because the current bundle optimizer is synchronous, cancellation cannot interrupt an already-running numerical iteration; it prevents a cancelled job from being treated as a successful state commit. Future optimizer checkpoints can be wired into the same cancellation protocol without changing state ownership.
