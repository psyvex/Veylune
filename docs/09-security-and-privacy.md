# 9. Security and Privacy Architecture

Status: Adopted baseline

Veylune processes photographs and derived representations of people. Security and privacy are therefore architecture requirements, not post-launch features.

## 9.1 Threat model

Treat these as untrusted:

- uploaded images
- imported projects
- GLB/glTF/USD assets
- textures
- fonts/media
- model files
- model manifests from remote sources
- plugin-like future extensions
- URLs supplied by users

Primary threats:

- malicious parsing payloads
- decompression/resource-exhaustion attacks
- XSS
- supply-chain compromise
- dependency compromise
- malicious shaders/assets
- oversized GPU allocations
- corrupted project state
- data leakage through telemetry
- unintended network access
- model provenance/license violations
- cross-origin isolation mistakes

## 9.2 Trust boundaries

```text
Untrusted file/input
        |
        v
Validation + resource limits
        |
        v
Isolated worker/parser
        |
        v
Validated intermediate representation
        |
        v
Rust/WASM domain engine
        |
        v
Renderer/exporter
```

Never pass arbitrary imported structures directly into rendering or engine internals.

## 9.3 File validation

All imported assets must be checked for:

- file size
- dimensions
- decompressed size
- nesting depth
- triangle/vertex counts
- texture dimensions
- animation count
- material count
- external references
- unsupported extensions
- malformed binary structures
- cyclic references
- duplicate content

Set explicit budgets before parsing large assets.

## 9.4 Image safety

Image ingestion should:

1. decode through browser-controlled APIs where practical
2. strip or isolate EXIF metadata from derived assets unless the user explicitly preserves it
3. avoid retaining GPS metadata unnecessarily
4. normalize dimensions under a configured resource budget
5. reject pathological dimensions
6. preserve the original only when required by the project and user policy

## 9.5 Project safety

Project loading is equivalent to opening an untrusted document.

Use:

- schema validation
- migration validation
- content hashes
- maximum nesting depth
- maximum artifact sizes
- dependency cycle detection
- safe defaults
- atomic writes
- recovery journal/checkpoints

Never execute code embedded in a project.

## 9.6 Content Security Policy

Production deployment should use a restrictive CSP and evolve it with the runtime.

Baseline goals:

- no unnecessary inline script
- no arbitrary script sources
- explicit worker sources
- explicit WASM sources
- explicit image/media sources
- explicit connect destinations
- restrictive object/embed policy
- restrictive frame policy

Use Trusted Types when compatible with the application stack.

## 9.7 Cross-origin isolation

If WASM threading/SIMD and SharedArrayBuffer require cross-origin isolation, configure the deployment consistently and test all resource types under that policy.

Do not enable isolation accidentally without auditing third-party resources.

## 9.8 Network policy

Default application behavior:

- local processing
- no upload of source photographs
- no third-party analytics that receive project content
- no remote model download from arbitrary user-provided URLs

Remote access should be limited to a known allowlist for application/model distribution.

## 9.9 Model supply chain

Models are executable data from a security and resource perspective even when they do not directly execute application code.

Each distributed model requires:

- pinned version
- cryptographic hash
- source provenance
- license metadata
- expected size
- supported runtime
- benchmark record
- integrity verification

Do not dynamically execute arbitrary model URLs supplied by users.

## 9.10 Dependency security

Maintain:

- lockfiles
- dependency update policy
- automated vulnerability scanning
- SBOM generation
- license scanning
- Rust crate auditing
- npm package auditing
- dependency provenance where supported

Review high-risk transitive dependencies before release.

## 9.11 WebGPU security

WebGPU runs within browser security boundaries, but applications must still enforce resource limits because GPU workloads can be expensive or destabilizing.

Every custom compute path should define:

- maximum buffer sizes
- maximum workgroups
- timeout/cancellation strategy where feasible
- expected memory usage
- recovery after device loss

## 9.12 WASM security

WASM modules should be built reproducibly and pinned by version/hash.

Avoid dynamic WASM module loading from arbitrary URLs.

Treat the JS/WASM boundary as an API boundary with explicit schemas and bounded inputs.

## 9.13 Privacy architecture

Privacy defaults:

- photos stay local
- derived meshes stay local
- project files stay local
- telemetry is disabled or minimized by default unless an explicit product policy says otherwise
- no biometric identification feature is required for reconstruction

If optional cloud features are introduced, the UI must state exactly what leaves the device before transfer.

## 9.14 Data minimization

Separate:

```text
Source photograph
Derived analysis
Derived biometric-like features
3D reconstruction
User-authored scene
Diagnostics
```

Each category gets its own retention policy.

Delete intermediate artifacts when no longer required and when the user chooses project cleanup.

## 9.15 Privacy requests

If an account/cloud mode is introduced, support documented processes for:

- access
- deletion
- correction where applicable
- portability where applicable
- consent withdrawal where applicable
- retention explanation

The local-only product should make deletion understandable: project deletion, cached model deletion, temporary artifact deletion, and browser storage cleanup should be distinguishable.

## 9.16 Security release gates

A release is blocked when:

- a critical known dependency vulnerability affects reachable code
- untrusted assets can bypass validation
- arbitrary remote code/model loading is possible
- project imports can execute code
- source photos unexpectedly leave the device
- integrity verification fails for release models
- CSP is weakened without review
- a security boundary lacks a test

## 9.17 References

Primary references used during architecture research include:

- MDN WebGPU API: https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API
- ONNX Runtime Web deployment/security: https://onnxruntime.ai/docs/tutorials/web/deploy.html
- NIST AI RMF: https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-ai-rmf-10
- UK ICO biometric guidance: https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/lawful-basis/biometric-data-guidance-biometric-recognition/
