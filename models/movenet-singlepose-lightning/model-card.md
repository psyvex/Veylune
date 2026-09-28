# Model card — MoveNet SinglePose Lightning (int8, ONNX)

**Status: candidate — not yet approved for production use.** See "What is still unverified" below; this satisfies Stage 0 task 4 of `docs/75-production-task-pipeline.md` (a real, checked-in manifest wired through validation), not the full Phase 1 model-selection gate in `docs/42-vision-model-selection.md`.

## Identity

- **Model:** MoveNet SinglePose Lightning
- **Publisher of this ONNX export:** Xenova (community re-export for Transformers.js), not Google directly
- **Source:** https://huggingface.co/Xenova/movenet-singlepose-lightning
- **Artifact used:** `onnx/model_quantized.onnx` (int8), 2,789,017 bytes
- **Artifact digest:** `sha256:5021097f4e9a4be612f2feb1d7d998f4a07b2ab3dbee0e8717e059c00315587f` (HF LFS `x-linked-etag`, confirmed 2026-09-28 against commit `ed0f314bb7356fd1dbf1e4f52c2d40791bf6534f`)
- **License:** Apache-2.0 (per the HF repo's `cardData.license` and `.gitattributes`; original MoveNet from Google is also Apache-2.0)

## What it does

Single-person 2D pose estimation: given one roughly-centered person, returns 17 COCO body keypoints (`[y, x, score]` each, image-plane, normalized to the 192x192 input). No depth, no multi-person separation, no 3D.

## Why this model, for what task

Selected as the Phase 1 "pose estimation (2D landmarks)" candidate (`docs/75-production-task-pipeline.md` task 17), which the roadmap needs for viewpoint classification (task 18) and coverage reporting (task 19). It is explicitly **not** a reconstruction/tracking model and must not be used for camera pose or feature matching — that pipeline already exists in `apps/web/src/capture/` and is unrelated to this model.

## Input / output contract

See `manifest.json` — `inputSchema`/`outputSchema`. Input: `int32 [1,192,192,3]` RGB, no pre-normalization (the graph's own preprocessing subgraph does it). Output: `float32 [1,1,17,3]`.

**Corrected 2026-09-28:** the input dtype was originally guessed as `uint8` from the published MoveNet spec without running the artifact. Actually loading and running this exact ONNX graph (`tools/verify-model-inference.mjs`) showed it rejects `tensor(uint8)` (`ERROR_CODE: 2, Unexpected input data type`) and requires `tensor(int32)` — the ONNX export evidently widened the input dtype from the original TF SavedModel's `uint8`. `manifest.json` and this card now reflect what the graph actually accepts, not the published spec.

## Known limitations

See `manifest.json`'s `knownLimitations` array — duplicated there so `manifest-validation.ts` can assert it's non-empty before a model is ever wired live.

## What is still unverified (blocking `approvalStatus: "approved"`)

Per `docs/42-vision-model-selection.md`'s decision boundary, before this becomes anything other than a `candidate`:

1. ~~Operator support / actual load success~~ — **verified 2026-09-28**,
   both via raw `onnxruntime-web` (`tools/verify-model-inference.mjs`) and
   via this repo's own `apps/web/src/inference/` engine abstraction
   (`src/inference/onnx-engine-movenet.test.ts`, once `TensorInput`/
   `OnnxInferenceEngine` were widened past `Float32Array`-only — see
   "Integration gap" below, now closed). Output shape `[1,1,17,3]` matches
   the manifest, all values finite, through both paths. Session create
   ~255ms, steady-state inference ~46ms/frame on this dev machine (macOS
   arm64) — **not** a target-device or real-browser number.
2. WebGPU vs. WASM behavior and latency on a representative **browser** on
   a representative **device** — still not measured; the Node number above
   is a floor, not a browser benchmark.
3. Whether the int8 quantized variant's keypoint accuracy is acceptable for
   Veylune's coverage-report use case, versus the fp16/fp32 variants in the
   same HF repo — still unmeasured (would need a labeled pose dataset to
   score against).
4. Failure-rate/robustness testing against the malformed-input and
   capability-fallback gates in `docs/12-production-readiness-and-research-log.md`
   §12.7 — not attempted.

### Integration gap found during verification — now closed (2026-09-28)

`OnnxInferenceEngine`/`TensorInput` were hardcoded to `Float32Array` only;
`vision/manifest.ts`/`vision/preprocess.ts` assumed NCHW float32 input.
Both widened: `TensorInput` now carries an explicit `dtype`
(`"float32" | "int32" | "uint8"`, defaulting to `float32` for source
compatibility), `OnnxRuntimeModule.Tensor` passes it through;
`VisionModelManifest.input` gained `layout: "nchw" | "nhwc"` and
`dtype`/`normalization: "none"`, `validateVisionManifest` checks the
channel dimension against whichever layout is declared;
`vision/preprocess.ts` gained `rgbaToNhwcTensor` alongside the existing
`rgbaToNchwTensor` (kept separate — they produce genuinely different
shapes/dtypes for a caller that already knows which one its model needs).
`onnx-engine-movenet.test.ts` proves the widened engine actually loads and
runs this model's real weights end to end. Nothing in the app was already
calling any of this — `OnnxInferenceEngine`, `TensorInput`, and
`VisionModelManifest` had zero production consumers before and after, so
this was a safe widen, not a live behavior change.

## Compliance notes

Outputs are 2D body-landmark keypoints, not a biometric identification capability (no face embedding, no identity matching) — relevant to the CCPA/ICO biometric-risk flag in `docs/75-production-task-pipeline.md` task 52. This should be re-confirmed by whoever owns the compliance track before this model is approved; a model card asserting a technical fact is not a substitute for that review.

## Provenance / EU AI Act Article 50

Any Studio surface that displays this model's keypoints as an overlay on a person's photo should be considered AI-generated/AI-derived annotation and carry the same disclosure the reconstruction pipeline's `EvidenceState` already models (`Inferred`/`Reconstructed`) — see `docs/09-security-and-privacy.md` and task 50. Not yet wired to any UI, so no disclosure surface exists yet either.
