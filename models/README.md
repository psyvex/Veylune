# Models

Model manifests and metadata, per the contract in `docs/21-model-registry-and-provenance.md`.

Each subdirectory is one model identity: `models/<model-id>/manifest.json` plus its model
card. Model weights are not committed here; the manifest references a source URI and an
artifact digest that `apps/web/src/inference/manifest-validation.ts` verifies at load time.

`manifest.schema.json` is the shape every `manifest.json` must satisfy. No model is wired
into the inference engine registry until its manifest validates and its benchmark record
(see `benchmarks/`) has been reviewed.

`movenet-singlepose-lightning/` is the first real example: a checked-in manifest + model
card for a Phase 1 pose-estimation candidate, validated by
`apps/web/src/inference/model-registry-manifest.ts` (see its test for the wiring). Its
`approvalStatus` is `"candidate"`, not `"approved"` — the model card lists exactly what
verification is still outstanding before it may be loaded live. No weights are committed;
only the manifest and model card.
