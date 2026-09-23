# 26. Browser Foundation Implementation

The browser foundation now has concrete TypeScript boundaries under `apps/web`.

## Current modules

- `runtime/capabilities.ts` — capability detection without user-agent branching.
- `runtime/job.ts` — transport-independent typed worker/job contract.
- `storage/contracts.ts` — browser-independent project and artifact storage interfaces.

The package uses strict TypeScript settings, including `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, and `isolatedModules`.

## Capability policy

Capability detection distinguishes supported, unsupported and unknown states. Unknown is intentionally preserved because browser APIs can expose incomplete capability information. Runtime policy must not infer missing capabilities as failures.

## Storage policy

The browser application depends on `ProjectStore`, not directly on IndexedDB or OPFS. Concrete adapters can therefore be introduced and tested independently without leaking browser persistence details into domain code.

## Job policy

`JobTransport` defines submission, cancellation and event delivery without coupling the application to `Worker`, `MessagePort`, WASM or a future native transport.

## Next implementation

The next browser layer should add concrete IndexedDB/OPFS adapters, a worker transport, and the WASM bridge. These should preserve the interfaces above rather than expanding them around a particular browser implementation.
