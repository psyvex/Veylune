# Models

Model manifests and metadata, per the contract in `docs/21-model-registry-and-provenance.md`.

Each subdirectory is one model identity: `models/<model-id>/manifest.json` plus its model
card. Model weights are not committed here; the manifest references a source URI and an
artifact digest that `apps/web/src/inference/manifest-validation.ts` verifies at load time.

`manifest.schema.json` is the shape every `manifest.json` must satisfy. No model is wired
into the inference engine registry until its manifest validates and its benchmark record
(see `benchmarks/`) has been reviewed.
