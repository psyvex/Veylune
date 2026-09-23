# 18. WASM Bridge Contract

## Purpose

The WASM boundary is the stable interface between the browser application and the Rust engine. It must remain small, versioned, typed and independent of UI framework details.

## Rules

- JavaScript owns orchestration and presentation.
- Rust owns deterministic domain computation.
- Large binary data should not be copied unnecessarily.
- The bridge must never expose internal Rust implementation details.
- Every exported operation has a versioned request/response contract.
- Errors are structured and serializable.

## Operation categories

```text
project
  create/open/validate/migrate

analysis
  inspect/quality/coverage

reconstruction
  start/pause/cancel/resume/status

geometry
  validate/bounds/metrics

export
  prepare/validate
```

## Binary transfer

Prefer transferable `ArrayBuffer` objects for one-shot transfers. Shared memory is an optimization requiring cross-origin isolation and explicit capability detection; it is never a correctness dependency.

## Error boundary

Rust failures become stable error categories rather than raw panic strings. Panics must not cross the application boundary as successful operations.

Suggested categories:

- InvalidInput
- UnsupportedFormat
- UnsupportedCapability
- ResourceLimitExceeded
- Cancelled
- CorruptProject
- InternalFailure

## Versioning

Bridge version changes require compatibility tests. Breaking changes require a new bridge version rather than silently changing the meaning of an existing operation.

## Security

The bridge must validate lengths, IDs, enum values and declared resource sizes before invoking expensive engine operations.
