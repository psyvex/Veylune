# 41. Versioned Vision Model Manifest

The vision pipeline now has a model-specific manifest contract.

The manifest records the immutable model identity, ONNX format, SHA-256 digest, license, supported execution backends, exact NCHW input shape/normalization, and bounded output schema.

A model cannot enter the vision pipeline without passing manifest validation.

## Artifact policy

No model artifact is committed by this change. A production artifact must be obtained from a source whose license permits the intended use, then its exact bytes must be hashed and recorded in the manifest.

The digest is an integrity identifier, not a substitute for provenance or license verification.

## Activation flow

```text
manifest validation
      -> artifact download
      -> SHA-256 verification
      -> runtime compatibility
      -> benchmark
      -> model-specific postprocessing
      -> realtime enablement
```

The next step is to select and verify a specific small vision model rather than silently introducing an arbitrary artifact.
