# 22. Error and Diagnostics Contract

## Goal

Make failures understandable to users, actionable for developers, and safe for privacy.

## Error shape

Every subsystem exposes a structured error with:

- stable error code
- subsystem
- severity
- user-safe message
- recovery action
- retryability
- diagnostic ID
- optional cause chain for local diagnostics

Raw stack traces, file contents, model inputs and personal data must never be placed in user-facing errors.

## Severity

- `Info`: expected state or non-blocking notice
- `Warning`: operation can continue with reduced quality/capability
- `Recoverable`: operation failed but project state remains valid
- `Fatal`: application/session recovery is required

## Recovery-first behavior

Errors should tell the application what to do next:

```text
retry
retry_with_lower_quality
free_storage
switch_backend
remove_invalid_asset
restore_checkpoint
restart_worker
export_diagnostics
```

## Diagnostics

Local diagnostics may include:

- browser/runtime capability profile
- Veylune version
- engine/bridge version
- job ID
- model IDs/digests
- timing/resource measurements
- structured error chain

They must exclude source photographs and project contents unless the user explicitly chooses to attach them.

## Telemetry

If telemetry is introduced, diagnostic events must be:

- opt-in where legally/ethically appropriate
- minimized
- content-free by default
- documented
- deletable where applicable

## Crash handling

A crash or worker termination must preserve the last valid committed project revision. Recovery diagnostics should be generated separately from project content.
