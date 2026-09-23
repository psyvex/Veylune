# 40. Vision Model Pipeline

The first concrete vision-model boundary is now defined from camera pixels to validated tensors.

## Preprocessing

RGBA camera data is converted to normalized NCHW `float32` tensors with explicit dimensions. Mean/std normalization is configurable and defaults to an identity normalization after conversion to `[0, 1]`.

Input byte length is checked before allocation and processing.

## Output validation

Model outputs are validated for rank, bounded element count and finite numeric values before application code consumes them.

This prevents malformed or unexpected model output from silently entering capture guidance.

## Runtime flow

```text
camera frame
   -> RGBA validation
   -> deterministic preprocessing
   -> TensorInput
   -> ONNX/runtime adapter
   -> TensorOutput
   -> output validation
   -> domain-specific postprocessing
   -> scan guidance
```

## Production constraint

The preprocessing contract must exactly match the selected model's training/export contract. Width, height, channel order, normalization, datatype and output schema belong in the model manifest; the current utilities provide the safe execution boundary but do not declare a particular production model.

No camera frame is uploaded by this pipeline. The intended execution path is local browser inference.

## Next step

Add a versioned, licensed small vision model artifact and its manifest, then implement model-specific postprocessing and benchmark fixtures against representative devices before enabling it in the realtime scan loop.
