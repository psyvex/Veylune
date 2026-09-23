# 17. Asset Ingestion Security

## Threat model

Every imported image, model, texture, project archive and future plugin/model artifact is untrusted input.

The ingestion pipeline must assume malformed or adversarial content.

## Pipeline

```text
Input
  |
  v
Size/type preflight
  |
  v
Format validation
  |
  v
Safe decode/parser
  |
  v
Resource budget check
  |
  v
Content hashing
  |
  v
Sanitized internal representation
  |
  v
Project storage
```

## Hard limits

Before expensive parsing, enforce configurable limits for:

- file bytes
- dimensions
- pixel count
- decompressed size
- mesh vertex/triangle count
- texture dimensions
- animation duration/count
- archive entry count
- archive expansion ratio
- project artifact count

Limits must be capability-aware and fail closed.

## Parser isolation

Binary parsing should happen away from the UI thread. Native/unsafe parsers, when eventually required, must be isolated behind narrow adapters and fuzz-tested.

## Content types

Do not infer trust from file extension. Validate actual content and expected structure.

For GLB/glTF and other structured 3D formats, validate:

- container structure
- buffer ranges
- accessor bounds
- index ranges
- image references
- material references
- animation references
- extension allowlist
- resource sizes

## Model files

Downloaded ML models are supply-chain inputs. Model manifests should record:

- model identifier
- version
- source
- license
- expected hash
- supported runtimes
- input/output schema
- provenance

A model should not become active solely because a URL returned bytes.

## Failure behavior

Reject invalid input with a structured, user-readable reason. Never partially publish an invalid artifact into the normal project namespace.

## Logging

Security logs should record event class and diagnostic identifiers, not raw photographs, model content or other user assets.
