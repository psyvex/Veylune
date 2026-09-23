# 13. Foundation Baseline

## Purpose

This document records the minimum engineering foundation established before feature-heavy implementation begins.

## Repository structure

```text
apps/                 Product applications
crates/
  core/               Stable domain primitives and project schema types
  geometry/           Geometry-specific algorithms and validation
  reconstruction/     Reconstruction pipeline and job lifecycle
  runtime/            Capability detection and execution policy
packages/             TypeScript application/shared packages
models/               Model manifests and provenance metadata
benchmarks/           Quality and performance fixtures
docs/                 Architecture, security, legal and research records
tools/                Developer/model tooling
```

## Core boundaries

- `veylune-core` owns stable domain types and versioned project primitives.
- `veylune-geometry` owns geometry concerns and does not own UI state.
- `veylune-reconstruction` owns reconstruction stages, evidence state and progress semantics.
- `veylune-runtime` owns execution capability and quality-tier policy.
- Browser/UI code must not duplicate these domain concepts.

## Safety baseline

Rust foundation crates forbid unsafe code until a measured requirement proves otherwise. Any future unsafe block must be isolated, justified, documented and tested at its boundary.

## Execution policy

WebGPU is preferred when available. WASM remains the portable CPU fallback. Runtime decisions are capability-driven rather than user-agent-driven.

## Data integrity

Projects and assets must carry stable IDs, schema versions and provenance. Observed, reconstructed, inferred, generated and uncertain evidence must remain distinguishable throughout the pipeline.

## Production gates

Before a subsystem is promoted beyond foundation status, it should have:

1. deterministic unit tests where practical
2. malformed-input tests
3. cancellation/recovery behavior for long-running work
4. explicit memory/resource limits
5. browser capability fallback
6. provenance/version metadata
7. security review of untrusted inputs
8. documentation updated with architectural decisions

## Next foundation work

The next implementation layers should establish:

- workspace-wide formatting/linting/test configuration
- CI for Rust and TypeScript
- WASM package boundary
- worker/job protocol
- capability probing in the browser
- project storage abstraction
- secure asset ingestion and validation
- benchmark fixtures
- model manifest/provenance format

Feature development should build on these boundaries rather than bypassing them.
