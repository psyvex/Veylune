# 25. Release and Supply-Chain Security

## Goal

Protect users from compromised dependencies, model artifacts and build outputs.

## Dependency controls

- Keep Rust and JavaScript dependencies pinned through lockfiles where applicable.
- Review dependency updates for security and license impact.
- Minimize dependencies in security-sensitive parsers and bridge code.
- Prefer maintained projects with transparent release histories.

## Build integrity

Release builds should record:

- source commit
- toolchain versions
- dependency lock state
- model manifest versions
- build configuration
- artifact hashes

Production artifacts should be reproducible as far as practical.

## Model supply chain

Model artifacts are treated as dependencies, not trusted application code. They require manifest validation, integrity verification, license review and runtime compatibility checks.

## Web assets

Third-party scripts should be minimized. Security-sensitive browser resources should use strict content security policy and integrity controls where the delivery mechanism supports them.

## Release channels

Use distinct channels for:

- development
- preview/beta
- production

Production should not silently consume mutable development model URLs or unpinned experimental dependencies.

## Vulnerability response

Security findings require:

1. triage
2. affected-version identification
3. containment or mitigation
4. patch
5. regression test
6. release-note/security-note decision
7. dependency/model replacement when necessary

## Update safety

Application and model updates must fail safely. A failed update must not destroy the user's existing project data or leave the project unreadable.
