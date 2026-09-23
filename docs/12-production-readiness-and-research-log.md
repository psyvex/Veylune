# 12. Production Readiness and Research Log

Status: Living document

## 12.1 Current conclusion

The Veylune direction is fundamentally sound for the stated goal of a production-grade client-first 3D reconstruction studio.

The strongest existing decisions are:

- Rust computational core
- WASM browser execution
- WebGPU as preferred accelerated path
- model-independent ML interfaces
- explicit observed/inferred confidence
- progressive reconstruction
- native project model separate from interchange format
- local-first privacy direction

The main risk is not the foundation. The main risk is attempting to build a large number of advanced features before the production infrastructure around them is complete.

## 12.2 Changes adopted from research

### Adopt now

- formal capability profiles
- central job lifecycle
- checkpoint/resume model
- GPU resource manager
- model manifest and integrity verification
- strict asset/project validation
- security boundaries around untrusted files
- privacy-by-default network policy
- provenance metadata
- legal/compliance architecture
- benchmark and fixture strategy
- schema/version migration strategy
- browser/device performance tiers

### Build early

- WebGPU rendering/compute path
- WASM SIMD/threads where supported
- ONNX Runtime Web abstraction
- worker architecture
- IndexedDB/OPFS storage layer
- autosave/recovery
- asset graph
- quality/capability system
- accessibility foundations
- export validation

### Later

- WebNN acceleration when validated on supported target browsers/devices
- neural rendering
- Gaussian splatting
- advanced hair/clothing simulation
- native desktop shell
- optional remote inference
- collaboration/cloud sync

### Experimental

- fully neural scene generation
- real-time generative reconstruction at high resolution
- browser-native training
- automatic cinematic generation

## 12.3 Technology decisions

| Area | Decision | Rationale |
|---|---|---|
| Core | Rust | Strong memory model, native/WASM path, suitable for geometry and systems code |
| Browser CPU | WASM | Portable and local-first |
| GPU | WebGPU | Modern browser GPU compute/graphics; not universal, so fallback required |
| ML | Provider abstraction | Avoid model/runtime lock-in |
| ML runtime | ONNX Runtime Web candidate | Practical WASM/WebGPU/WebNN execution paths |
| WebNN | Optional | Hardware acceleration potential, but current browser availability is insufficient for a hard dependency |
| Renderer | Three.js/R3F initially | Mature browser 3D ecosystem and rapid studio UI integration |
| Native project | Veylune schema | Authoring state is richer than interchange formats |
| Interchange | glTF/GLB | Strong web/runtime interchange fit |
| Storage | IndexedDB + OPFS | Structured metadata plus large local binary artifacts |
| Heavy work | Workers | Keep UI responsive |
| Telemetry | Privacy-preserving/opt-in | Source imagery and projects remain local by default |

## 12.4 Current browser reality

WebGPU is a secure-context API and remains limited availability rather than a universal baseline web feature. Therefore Veylune must not make WebGPU the only execution path.

ONNX Runtime Web documents WASM, WebGPU, WebNN and WebGL providers. Its current browser matrix shows meaningful variation across Chrome/Edge, Safari and Firefox. This reinforces capability detection and fallback as correctness requirements rather than optional optimization.

WebNN should be treated as an accelerator that can be enabled when a tested browser/device combination supports the required operators and performance characteristics.

## 12.5 Responsible AI baseline

Use the NIST AI Risk Management Framework as a governance reference for trustworthy AI characteristics including validity/reliability, safety, security/resilience, accountability/transparency, explainability, privacy enhancement, and fairness.

Veylune should maintain:

- model cards
- benchmark results
- known limitations
- provenance
- regression tests
- failure cases
- release records

Reference: https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-ai-rmf-10

## 12.6 Regulatory watch

### EU

The European Commission states that AI Act Article 50 transparency obligations apply from 2 August 2026, including requirements concerning certain AI-generated/manipulated content and deepfakes. Veylune therefore needs provenance and labeling architecture before launch rather than retrofitting it later.

### India

The Digital Personal Data Protection Rules, 2025 were notified in November 2025 with phased commencement. Veylune's privacy architecture should be designed to support the applicable requirements from the beginning.

### California

The current CCPA statute treats biometric information used for uniquely identifying a consumer as sensitive personal information. Avoid building unnecessary identity recognition into the product.

### UK

ICO guidance distinguishes biometric data from special-category biometric data based on technical processing and purpose, including whether it is used for uniquely identifying a person. This distinction must be documented for any future recognition capability.

## 12.7 Production gates

No feature should be called production-ready until it has:

- automated tests
- representative fixtures
- malformed-input tests
- cancellation tests
- recovery tests
- performance benchmarks
- memory tests
- capability fallback tests
- security review
- licensing review
- documentation
- schema/version metadata

## 12.8 Research maintenance policy

This document is living documentation.

Review when:

- a major browser API changes
- a major ML runtime changes execution-provider support
- a major model is introduced
- a new export format is added
- privacy/regulatory requirements change
- a security incident occurs
- a major performance bottleneck is discovered
- a dependency is replaced

Every material architectural change should update the relevant ADR and this research log.

## 12.9 Primary research references

- MDN WebGPU: https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API
- MDN GPU/WebGPU worker context: https://developer.mozilla.org/en-US/docs/Web/API/GPU
- ONNX Runtime Web: https://onnxruntime.ai/docs/tutorials/web/
- ONNX Runtime Web deployment/security: https://onnxruntime.ai/docs/tutorials/web/deploy.html
- ONNX Runtime Web WebGPU: https://onnxruntime.ai/docs/tutorials/web/ep-webgpu.html
- ONNX Runtime Web WebNN: https://onnxruntime.ai/docs/tutorials/web/ep-webnn.html
- NIST AI RMF: https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-ai-rmf-10
- EU AI Act transparency guidance: https://digital-strategy.ec.europa.eu/en/policies/guidelines-ai-transparency-obligations
- EU AI Act Article 50 FAQ: https://digital-strategy.ec.europa.eu/en/faqs/transparency-obligations-under-article-50-ai-act
- India DPDP Rules 2025: https://www.meity.gov.in/documents/act-and-policies/digital-personal-data-protection-rules-2025-gDOxUjMtQWa?pageTitle=Digit
- UK ICO biometric guidance: https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/lawful-basis/biometric-data-guidance-biometric-recognition/
- California CCPA statute: https://cppa.ca.gov/regulations/pdf/ccpa_statute_eff_20260101.pdf
