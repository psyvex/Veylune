# 21. Model Registry and Provenance

## Goal

Make every AI model used by Veylune identifiable, reproducible, replaceable and license-aware.

## Model manifest

Each model entry should contain:

- stable model ID
- semantic/version identifier
- artifact digest
- source URI or distribution reference
- license
- model card/reference documentation
- supported execution backends
- input schema
- output schema
- preprocessing version
- postprocessing version
- minimum capability tier
- known limitations
- evaluation dataset/version
- approval status

## Activation

A model is usable only after manifest validation, artifact integrity verification and compatibility checks.

The application must not silently replace a model with a different artifact under the same immutable model identity.

## Reproducibility

A reconstruction result should record:

- model IDs and digests
- pipeline version
- preprocessing version
- runtime/backend
- relevant quality settings
- input artifact IDs

This allows later diagnosis when output changes.

## Licensing

Model and dependency licenses must be reviewed before distribution. The registry is the engineering record; legal approval remains a separate release gate.

## Evaluation

Models require benchmark records for:

- reconstruction quality
- failure rate
- latency
- peak memory
- browser/backend compatibility
- representative input categories

A model may be technically compatible but still rejected for production if quality or resource behavior is unacceptable.

## Replacement

Models are replaceable behind stable pipeline interfaces. Replacing a model creates a new model identity/version and should not invalidate existing project provenance.
