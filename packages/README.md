# Packages

Shared TypeScript packages consumed by more than one app (currently only
`apps/web`). This is where types generated from, or shared with, the Rust/WASM
bridge contract (`docs/18-wasm-bridge-contract.md`) will live once a second
application surface exists, so they are not duplicated by copy-paste.

Empty until `docs/75-production-task-pipeline.md` Stage 1 needs a package
boundary; the `pnpm-workspace.yaml` `packages/*` glob already covers this
directory.
