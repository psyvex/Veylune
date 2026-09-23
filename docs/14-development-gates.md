# 14. Development Gates

Veylune uses automated gates before implementation is allowed to grow across subsystem boundaries.

## Rust gate

Every Rust change must pass:

- `cargo fmt --all -- --check`
- `cargo check --workspace --all-targets`
- `cargo test --workspace`
- `cargo clippy --workspace --all-targets -- -D warnings`

## Architecture gate

A subsystem must define:

1. ownership boundary
2. public data contract
3. error model
4. cancellation behavior for long-running work
5. resource limits
6. version/provenance requirements
7. fallback behavior
8. tests
9. documentation

## Security gate

Any feature that consumes untrusted files, models, images, project data, shader inputs or network content must define:

- parser limits
- allocation limits
- malformed-input handling
- trust boundary
- isolation strategy
- provenance/integrity checks where applicable

## Privacy gate

A feature must explicitly document whether data can leave the device. Local-only behavior is the default. Telemetry and diagnostics must not implicitly collect user content.

## Performance gate

Expensive work must not be placed on the browser main thread. New large allocations, model loads and GPU resources require bounded lifecycle ownership and cancellation/release behavior.

## Documentation gate

Architecture-affecting changes update the relevant document in the same change set. Research-driven decisions are recorded with their date, source class and replacement/migration strategy.

## Current CI

The repository CI currently enforces the Rust gate on pushes to `main` and pull requests. Browser, WASM, security, performance and cross-device gates will be added as those subsystems enter implementation.
