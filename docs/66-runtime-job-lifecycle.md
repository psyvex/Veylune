# 66. Runtime Job Lifecycle

The runtime layer now has an explicit job controller for long-running browser/WASM/WebGPU work.

## State lifecycle

```text
Queued -> Running -> Completed
   |         |
   |         +----> Cancelling -> Cancelled
   |         |
   +--------> Cancelled
             |
             +----> Failed
```

Invalid transitions are rejected. Cancellation is cooperative: a running job enters `Cancelling`, and the worker must observe that state before publishing a cancelled result.

## Resource accounting

Jobs receive a hard memory/intermediate-work budget. Reservations use checked arithmetic and cannot exceed the configured budget. Release is saturating so cleanup paths cannot underflow accounting.

## Integration contract

A future worker bridge should expose:

- job ID
- immutable input snapshot/version
- capability/backend selection
- resource budget
- progress updates
- cancellation request
- terminal result/error

The local-map transaction layer then prevents a late worker result from overwriting a newer capture state.
