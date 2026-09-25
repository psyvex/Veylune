# Tools

Development and model tooling that is not part of the shipped application: model
packaging/verification scripts (digest computation for `models/*/manifest.json`),
benchmark fixture generation, and other one-off maintenance scripts.

Nothing here is imported by `apps/web` or the Rust crates at build or runtime; treat
this directory as operator tooling only.
