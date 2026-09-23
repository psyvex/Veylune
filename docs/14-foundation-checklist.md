# 14. Foundation Checklist

## Completed

- [x] Rust workspace boundaries
- [x] Core domain primitives
- [x] Evidence/confidence model
- [x] Reconstruction lifecycle types
- [x] Runtime capability model
- [x] Unsafe-code prohibition in foundation crates
- [x] Rust formatting/lint configuration
- [x] Repository hygiene
- [x] Core invariant tests

## Next implementation gate

The foundation is ready for the browser/runtime integration layer. The next gate is intentionally infrastructure-first:

1. TypeScript application shell
2. typed Rust/WASM bridge
3. worker job protocol
4. browser capability probing
5. local project storage abstraction
6. secure image/asset ingestion
7. CI running Rust checks and browser tests
8. benchmark fixture format

No reconstruction model should be integrated until these boundaries exist. This keeps model experimentation from leaking into product architecture and makes later model replacement safe.

## Quality rule

Every new subsystem must add its tests and documentation in the same change. Architecture documentation is treated as a maintained engineering artifact, not a one-time design document.
