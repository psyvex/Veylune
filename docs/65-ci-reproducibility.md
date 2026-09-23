# 65. CI Reproducibility and Supply-Chain Baseline

CI failures exposed two repository hygiene issues before application tests could run:

- the web job requested npm caching without a committed npm lockfile
- the Rust runtime file was not rustfmt-clean

The CI workflow now avoids cache-key inference from a missing npm lockfile and pins its GitHub Actions dependencies to the exact revisions used by the current runner. The Rust runtime source is formatted according to the repository's configured formatter.

## Why this matters

A production pipeline should fail on real source/test regressions, not on missing package-manager metadata or formatting drift. Action pinning also reduces the supply-chain risk of mutable action tags.

## Next dependency-hardening step

Add and maintain a committed `package-lock.json` generated with the repository's supported npm version. Once that lockfile is intentionally adopted, npm CI caching can be restored with lockfile validation.
