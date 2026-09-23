# 67. Browser Worker Job Transport

Long-running reconstruction and inference work should not block the UI thread. The web runtime now has a worker-backed job transport with explicit message validation and lifecycle cleanup.

## Transport guarantees

- validates job IDs and operation names
- prevents duplicate active job IDs
- forwards progress/completion/failure events only for active jobs
- ignores malformed worker messages
- ignores stale messages from already-finished jobs
- converts worker errors into retryable failed job events
- supports cooperative cancellation
- removes listeners and terminates the worker on disposal

## Security boundary

Worker messages are treated as untrusted data. The transport never executes an operation named by the worker; operation dispatch remains owned by the worker-side application code.

## Reconstruction integration

The intended flow is:

```text
UI
  -> immutable map snapshot
  -> WorkerJobTransport
  -> worker reconstruction/optimization
  -> candidate snapshot + metrics
  -> versioned map transaction
  -> commit only if source version is still current
```

This keeps heavy numerical work off the main thread while preserving the stale-result protection established by the local-map transaction layer.
