# 28. Client-Side Inference

Veylune's browser pipeline supports small local AI models for realtime assistance while keeping heavy reconstruction work separate.

## Intended uses

Local models may provide:

- blur/sharpness classification
- exposure and framing assessment
- object/foreground segmentation
- frame similarity and duplicate detection
- viewpoint/coverage guidance
- lightweight feature extraction
- fast previews

These outputs are advisory pipeline signals. They do not silently replace authoritative reconstruction stages.

## Runtime selection

The browser selects an execution backend from actual capabilities:

```text
WebGPU -> WebNN -> WASM
```

Only backends explicitly supported by both the model manifest and the current capability profile may be selected.

## Model identity

Every model has an immutable identity consisting of its model ID, version and artifact digest. Model metadata records license, input/output schemas, supported backends and minimum quality tier.

## Integrity

Model bytes must be verified against the manifest digest before activation. A model cannot become active merely because bytes were downloaded successfully.

## Privacy

Inference runs locally. Camera frames and project assets are not uploaded by the inference layer.

## Memory lifecycle

Model loading and unloading must be explicit. The runtime must avoid keeping models resident when they are not needed, particularly on mobile devices with constrained memory.

## Model cache

The registry abstraction is intentionally independent of a specific browser cache. A persistent implementation can use Cache Storage, IndexedDB or OPFS after measuring browser behavior and quota characteristics.

## Production rule

Do not add a model solely because it is fashionable or large. Every client model must justify its memory, latency and quality trade-offs with benchmark evidence on representative devices.
