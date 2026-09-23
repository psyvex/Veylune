# 15. Worker and Job Contract

## Goal

All expensive browser work must execute outside the UI thread through cancellable, bounded jobs.

## Lifecycle

```text
queued -> running -> cancelling -> cancelled
                 |-> completed
                 |-> failed
```

A job must have:

- stable job ID
- operation type
- input references
- capability requirements
- resource budget
- progress state
- cancellation state
- output references
- structured error

## Trust boundary

Workers receive references to validated application data. They must not interpret arbitrary imported binary data without passing through the corresponding validator/parser boundary.

## Resource rules

Jobs must declare or derive:

- maximum input size
- expected memory class
- GPU requirement
- maximum intermediate size
- cancellation checkpoints

A job that exceeds a resource budget fails with a structured resource error rather than allowing unbounded allocation.

## Recovery

Long-running jobs should checkpoint reusable intermediate artifacts at stage boundaries. A cancelled or failed job must not corrupt the last valid project state.

## Future transport

The initial browser transport may use structured-clone messages. Large binary payloads should prefer transferable buffers or shared memory only when capability and isolation requirements are satisfied.

The contract must remain independent of the transport so native workers and future desktop runtimes can reuse it.
