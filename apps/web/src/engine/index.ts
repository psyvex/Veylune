// Typed entry point to the Rust/WASM engine (see docs/18-wasm-bridge-contract.md
// and ADR-013). This is the only module in apps/web that should import from
// `./wasm-bridge-gen` directly; everything else goes through the functions
// exported here so the generated bindings can be regenerated or renamed
// without touching call sites.

import initWasm, {
  accumulate_normal_equations_wasm,
  apply_camera_steps_wasm,
  apply_landmark_steps_wasm,
  apply_se3_increment_wasm,
  assemble_bundle_blocks_wasm,
  bundle_cost_wasm,
  clamp_confidence,
  clamp_vector_wasm,
  engine_version,
  initSync,
  predict_reduction_wasm,
  prepare_bundle_adjustment_wasm,
  preferred_backend,
  project_distorted_point_wasm,
  project_distorted_point_with_jacobian_wasm,
  project_point_wasm,
  project_schema_version,
  reconstruction_progress_fraction,
  huber_rho_squared_wasm,
  huber_weight_wasm,
  linearize_observation_wasm,
  linearize_observations_batch_wasm,
  reprojection_error_px_wasm,
  so3_exp_wasm,
  solve_bundle_schur_blocks_wasm,
  solve_positive_definite_wasm,
  triangulate_point_wasm,
  triangulate_points_wasm,
  WasmExecutionBackend,
  WasmQualityTier,
} from "./wasm-bridge-gen/veylune_wasm_bridge.js";

export type EngineVec3 = readonly [number, number, number];
export type EngineMat3 = readonly [number, number, number, number, number, number, number, number, number];
export interface EngineIntrinsics { readonly fx: number; readonly fy: number; readonly cx: number; readonly cy: number }
export interface EngineDistortion { readonly k1: number; readonly k2: number; readonly k3: number; readonly p1: number; readonly p2: number }
export interface EnginePose { readonly rotation: EngineMat3; readonly translation: EngineVec3 }
import wasmUrl from "./wasm-bridge-gen/veylune_wasm_bridge_bg.wasm?url";

export type QualityTier = "preview" | "balanced" | "high" | "maximum";
export type ExecutionBackend = "webgpu" | "wasm" | "native";

const QUALITY_TO_WASM: Record<QualityTier, WasmQualityTier> = {
  preview: WasmQualityTier.Preview,
  balanced: WasmQualityTier.Balanced,
  high: WasmQualityTier.High,
  maximum: WasmQualityTier.Maximum,
};

const BACKEND_FROM_WASM: Record<WasmExecutionBackend, ExecutionBackend> = {
  [WasmExecutionBackend.WebGpu]: "webgpu",
  [WasmExecutionBackend.Wasm]: "wasm",
  [WasmExecutionBackend.Native]: "native",
};

let loaded = false;
let ready: Promise<void> | null = null;

/**
 * Synchronous check for whether the WASM engine has finished loading —
 * the single source of truth every module needs (`reconstruction-engine-bootstrap.ts`'s
 * `isReconstructionEngineReady()` delegates to this rather than tracking
 * its own copy, so a load kicked off by one caller — `main.ts` on the main
 * thread, `reconstruction-worker-entry.ts` in the worker — is visible to
 * every other caller in that same module instance).
 */
export function isEngineLoaded(): boolean {
  return loaded;
}

/**
 * Loads and instantiates the WASM engine by fetching `wasmUrl` through Vite's
 * asset pipeline. Safe to call multiple times. This only works where `fetch`
 * can resolve a relative asset URL against a document base (a real browser,
 * or a worker); for Node-side tooling and tests, use
 * {@link loadEngineFromBytes} instead (see `engine/node-loader.ts`).
 */
export function loadEngine(): Promise<void> {
  if (ready) return ready;
  const pending = initWasm({ module_or_path: wasmUrl }).then(() => {
    loaded = true;
  });
  ready = pending;
  return pending;
}

/**
 * Instantiates the WASM engine from an already-read module or byte buffer,
 * bypassing the fetch `loadEngine` performs. Exists for Node-side callers
 * (tests, future CLI tooling) that read the built .wasm file off disk
 * themselves rather than through a browser asset fetch.
 */
export function loadEngineFromBytes(bytes: BufferSource | WebAssembly.Module): void {
  if (!ready) {
    initSync({ module: bytes });
    loaded = true;
    ready = Promise.resolve();
  }
}

function assertLoaded(): void {
  if (!loaded) {
    throw new Error("veylune engine: loadEngine() must be awaited before use");
  }
}

/** The engine crate's semantic version. */
export function engineVersion(): string {
  assertLoaded();
  return engine_version();
}

/** The project schema version this engine build supports. */
export function engineProjectSchemaVersion(): number {
  assertLoaded();
  return project_schema_version();
}

/** Selects an execution backend using the same rule the native runtime uses. */
export function enginePreferredBackend(
  capabilities: { webgpu: boolean; wasmSimd: boolean; wasmThreads: boolean },
  quality: QualityTier,
): ExecutionBackend {
  assertLoaded();
  const backend = preferred_backend(
    capabilities.webgpu,
    capabilities.wasmSimd,
    capabilities.wasmThreads,
    QUALITY_TO_WASM[quality],
  );
  return BACKEND_FROM_WASM[backend];
}

/** Clamps a confidence vector into `[0, 1]` per component. */
export function engineClampConfidence(confidence: {
  geometry: number;
  texture: number;
  pose: number;
  detail: number;
}): { geometry: number; texture: number; pose: number; detail: number } {
  assertLoaded();
  const [geometry, texture, pose, detail] = clamp_confidence(
    confidence.geometry,
    confidence.texture,
    confidence.pose,
    confidence.detail,
  );
  return { geometry, texture, pose, detail };
}

/** Fraction of reconstruction steps completed, clamped to `[0, 1]`. */
export function engineReconstructionProgressFraction(
  completedSteps: number,
  totalSteps: number,
): number {
  assertLoaded();
  return reconstruction_progress_fraction(completedSteps, totalSteps);
}

/**
 * SE(3) exponential map — the Rust port of `capture/se3.ts`'s `so3Exp`
 * (ADR-013, Stage 1). Not yet called by the capture pipeline: this is the
 * parity-test target proving the Rust and TypeScript implementations agree
 * before any caller switches over (see `se3-wasm-parity.test.ts`).
 */
export function engineSo3Exp(omega: EngineVec3): EngineMat3 {
  assertLoaded();
  return so3_exp_wasm(Float64Array.from(omega)) as unknown as EngineMat3;
}

/** Rust port of `se3.ts`'s `applySE3Increment` (ADR-013, Stage 1). Same
 * not-yet-wired status as {@link engineSo3Exp}. */
export function engineApplySe3Increment(
  rotation: EngineMat3,
  translation: EngineVec3,
  increment: { rotation: EngineVec3; translation: EngineVec3 },
): { rotation: EngineMat3; translation: EngineVec3 } {
  assertLoaded();
  const out = apply_se3_increment_wasm(
    Float64Array.from(rotation),
    Float64Array.from(translation),
    Float64Array.from(increment.rotation),
    Float64Array.from(increment.translation),
  );
  return {
    rotation: Array.from(out.slice(0, 9)) as unknown as EngineMat3,
    translation: Array.from(out.slice(9, 12)) as unknown as EngineVec3,
  };
}

/** Rust port of `distortion.ts`'s `projectDistortedPoint` (ADR-013, Stage
 * 1). `undefined` mirrors the TS return for a point behind the camera or
 * with non-finite coordinates. Same not-yet-wired status as {@link engineSo3Exp}. */
export function engineProjectDistortedPoint(
  point: EngineVec3,
  intrinsics: EngineIntrinsics,
  distortion: EngineDistortion,
): readonly [number, number] | undefined {
  assertLoaded();
  const out = project_distorted_point_wasm(
    Float64Array.from(point),
    intrinsics.fx, intrinsics.fy, intrinsics.cx, intrinsics.cy,
    distortion.k1, distortion.k2, distortion.k3, distortion.p1, distortion.p2,
  );
  return out.length === 0 ? undefined : [out[0]!, out[1]!];
}

/** Rust port of `distortion.ts`'s `projectDistortedPointWithJacobian`
 * (ADR-013, Stage 1). */
export function engineProjectDistortedPointWithJacobian(
  point: EngineVec3,
  intrinsics: EngineIntrinsics,
  distortion: EngineDistortion,
): { readonly pixel: readonly [number, number]; readonly jacobian: Float64Array } | undefined {
  assertLoaded();
  const out = project_distorted_point_with_jacobian_wasm(
    Float64Array.from(point),
    intrinsics.fx, intrinsics.fy, intrinsics.cx, intrinsics.cy,
    distortion.k1, distortion.k2, distortion.k3, distortion.p1, distortion.p2,
  );
  if (out.length === 0) return undefined;
  return { pixel: [out[0]!, out[1]!], jacobian: Float64Array.from(out.slice(2, 8)) };
}

/** Rust port of `reprojection.ts`'s `projectPoint` (ADR-013, Stage 1). */
export function engineProjectPoint(
  point: EngineVec3,
  intrinsics: EngineIntrinsics,
  pose: EnginePose,
): { readonly x: number; readonly y: number; readonly valid: boolean } {
  assertLoaded();
  const out = project_point_wasm(
    Float64Array.from(point),
    intrinsics.fx, intrinsics.fy, intrinsics.cx, intrinsics.cy,
    Float64Array.from(pose.rotation),
    Float64Array.from(pose.translation),
  );
  return { x: out[0]!, y: out[1]!, valid: out[2] === 1 };
}

/** Rust port of `reprojection.ts`'s `reprojectionErrorPx` (ADR-013, Stage
 * 1). */
export function engineReprojectionErrorPx(
  observed: readonly [number, number],
  point: EngineVec3,
  intrinsics: EngineIntrinsics,
  pose: EnginePose,
): number {
  assertLoaded();
  return reprojection_error_px_wasm(
    Float64Array.from(observed),
    Float64Array.from(point),
    intrinsics.fx, intrinsics.fy, intrinsics.cx, intrinsics.cy,
    Float64Array.from(pose.rotation),
    Float64Array.from(pose.translation),
  );
}

/** Rust port of `linear-solve.ts`'s `solvePositiveDefinite` (ADR-013, Stage
 * 1). `matrix` is row-major `size x size`. `undefined` mirrors the TS
 * return for a non-positive-definite or malformed system. */
export function engineSolvePositiveDefinite(size: number, matrix: Float64Array, rhs: Float64Array): Float64Array | undefined {
  assertLoaded();
  const out = solve_positive_definite_wasm(size, matrix, rhs);
  return out.length === 0 ? undefined : out;
}

/** Rust port of `sparse-normal-equations.ts`'s `accumulateNormalEquations`
 * (ADR-013, Stage 1). `jacobianFlat` is `rows * size` row-major (a nested
 * array can't cross the WASM boundary directly). Throws to mirror the TS
 * function's `throw` on mismatched dimensions or an invalid row. */
export function engineAccumulateNormalEquations(
  jacobianFlat: Float64Array,
  rows: number,
  size: number,
  residuals: Float64Array,
  weights: Float64Array,
): { readonly size: number; readonly gradient: Float64Array; readonly entries: readonly { row: number; column: number; value: number }[] } {
  assertLoaded();
  const out = accumulate_normal_equations_wasm(jacobianFlat, rows, size, residuals, weights);
  if (out.length === 0) throw new Error("Normal-equation dimensions do not match, or a row is invalid.");
  const resultSize = out[0]!;
  const gradient = out.slice(1, 1 + resultSize);
  const entryCount = out[1 + resultSize]!;
  const entries: { row: number; column: number; value: number }[] = [];
  let cursor = 1 + resultSize + 1;
  for (let i = 0; i < entryCount; i += 1) {
    entries.push({ row: out[cursor]!, column: out[cursor + 1]!, value: out[cursor + 2]! });
    cursor += 3;
  }
  return { size: resultSize, gradient, entries };
}

/** Rust port of the per-match triangulation core in `triangulation.ts`'s
 * `triangulateCorrespondences` (ADR-013, Stage 1) — only the single-point
 * math, not the match-list loop (see `crates/geometry/src/triangulation.rs`). */
export function engineTriangulatePoint(
  intrinsics: EngineIntrinsics,
  referencePose: EnginePose,
  currentPose: EnginePose,
  referencePx: readonly [number, number],
  currentPx: readonly [number, number],
  maxReprojectionErrorPx: number,
): { readonly x: number; readonly y: number; readonly z: number; readonly reprojectionErrorPx: number } | undefined {
  assertLoaded();
  const out = triangulate_point_wasm(
    intrinsics.fx, intrinsics.fy, intrinsics.cx, intrinsics.cy,
    Float64Array.from(referencePose.rotation), Float64Array.from(referencePose.translation),
    Float64Array.from(currentPose.rotation), Float64Array.from(currentPose.translation),
    referencePx[0], referencePx[1], currentPx[0], currentPx[1],
    maxReprojectionErrorPx,
  );
  return out.length === 0 ? undefined : { x: out[0]!, y: out[1]!, z: out[2]!, reprojectionErrorPx: out[3]! };
}

export type EngineTriangulatedPoint = { readonly x: number; readonly y: number; readonly z: number; readonly reprojectionErrorPx: number } | undefined;

/**
 * Batched Rust port of `triangulateCorrespondences`'s per-match core
 * (ADR-013, Stage 1) — one WASM call for a whole correspondence list
 * instead of one per match (see `triangulate_points`'s Rust module doc).
 * `pixelPairs` is flat `[referencePx, referencePy, currentPx, currentPy]`
 * per correspondence. Returns one entry per pair, in order, `undefined`
 * where the WASM side rejected it (same rejection reasons as
 * {@link engineTriangulatePoint}).
 */
export function engineTriangulatePoints(
  intrinsics: EngineIntrinsics,
  referencePose: EnginePose,
  currentPose: EnginePose,
  pixelPairs: Float64Array,
  maxReprojectionErrorPx: number,
): EngineTriangulatedPoint[] {
  assertLoaded();
  const out = triangulate_points_wasm(
    intrinsics.fx, intrinsics.fy, intrinsics.cx, intrinsics.cy,
    Float64Array.from(referencePose.rotation), Float64Array.from(referencePose.translation),
    Float64Array.from(currentPose.rotation), Float64Array.from(currentPose.translation),
    pixelPairs,
    maxReprojectionErrorPx,
  );
  const count = pixelPairs.length / 4;
  const results: EngineTriangulatedPoint[] = [];
  for (let i = 0; i < count; i += 1) {
    const base = i * 5;
    results.push(out[base] === 1 ? { x: out[base + 1]!, y: out[base + 2]!, z: out[base + 3]!, reprojectionErrorPx: out[base + 4]! } : undefined);
  }
  return results;
}

/** Rust port of `robust-loss.ts`'s `HuberLoss.rhoSquared` (ADR-013, Stage
 * 1). Throws for an invalid `delta`, mirroring the TS constructor's throw
 * (the WASM export uses a `NaN` sentinel internally; this wrapper turns
 * that back into the TS-shaped error). */
export function engineHuberRhoSquared(delta: number, residualSquared: number): number {
  assertLoaded();
  const result = huber_rho_squared_wasm(delta, residualSquared);
  // rhoSquared never itself returns NaN (non-finite/negative input maps to
  // Infinity) — a NaN result can only mean an invalid delta.
  if (Number.isNaN(result)) throw new Error("Huber delta must be positive.");
  return result;
}

/** Rust port of `robust-loss.ts`'s `HuberLoss.weight` (ADR-013, Stage 1).
 * Same invalid-`delta` handling as {@link engineHuberRhoSquared}. */
export function engineHuberWeight(delta: number, residualSquared: number): number {
  assertLoaded();
  const result = huber_weight_wasm(delta, residualSquared);
  // weight never itself returns NaN (non-finite/negative input maps to 0)
  // — a NaN result can only mean an invalid delta.
  if (Number.isNaN(result)) throw new Error("Huber delta must be positive.");
  return result;
}

export type SchurBlockSolveStatus = "solved" | "singular" | "insufficient";
export interface EngineBlockMatrix { readonly rows: number; readonly columns: number; readonly values: Float64Array }
export interface EngineSchurBlocks {
  readonly camera: EngineBlockMatrix;
  readonly cameraLandmark: EngineBlockMatrix;
  readonly landmark: EngineBlockMatrix;
  readonly cameraGradient: Float64Array;
  readonly landmarkGradient: Float64Array;
}

/** Rust port of `schur-block-solve.ts`'s `solveBundleSchurBlocks` (ADR-013,
 * Stage 1) — the Schur-complement solve `bundle-optimizer.ts` actually
 * calls. `schur.ts` and `schur-blocks.ts`/`schur-backsubstitution.ts` were
 * not ported; see `crates/reconstruction/src/schur_block_solve.rs`'s
 * module doc for why (dead code / non-shipped cross-check code). */
export function engineSolveBundleSchurBlocks(
  blocks: EngineSchurBlocks,
  damping: number,
): { readonly status: SchurBlockSolveStatus; readonly cameraStep: Float64Array; readonly landmarkStep: Float64Array } {
  assertLoaded();
  const out = solve_bundle_schur_blocks_wasm(
    blocks.camera.rows,
    Float64Array.from(blocks.camera.values),
    Float64Array.from(blocks.cameraLandmark.values),
    blocks.landmark.rows,
    Float64Array.from(blocks.landmark.values),
    Float64Array.from(blocks.cameraGradient),
    Float64Array.from(blocks.landmarkGradient),
    damping,
  );
  const statusCode = out[0]!;
  const status: SchurBlockSolveStatus = statusCode === 2 ? "solved" : statusCode === 1 ? "singular" : "insufficient";
  const cameraStep = out.slice(1, 1 + blocks.camera.rows);
  const landmarkStep = out.slice(1 + blocks.camera.rows);
  return { status, cameraStep, landmarkStep };
}

export interface EngineObservationLinearization {
  readonly residual: readonly [number, number];
  readonly weight: number;
  /** Column-major 2x6 (12 values) — see `bundle-linearization.ts`. */
  readonly cameraJacobian: Float64Array;
  /** Column-major 2x3 (6 values). */
  readonly landmarkJacobian: Float64Array;
  readonly valid: boolean;
}

/** Rust port of `bundle-linearization.ts`'s `linearizeObservation` (ADR-013,
 * Stage 1) — the per-observation core `linearizeBundle`'s `BundleProblem`
 * loop calls; that loop itself stays TS orchestration. */
export function engineLinearizeObservation(
  intrinsics: EngineIntrinsics,
  distortion: EngineDistortion,
  cameraPose: EnginePose,
  cameraFixed: boolean,
  landmark: EngineVec3,
  observed: readonly [number, number],
  weight: number,
): EngineObservationLinearization {
  assertLoaded();
  const out = linearize_observation_wasm(
    intrinsics.fx, intrinsics.fy, intrinsics.cx, intrinsics.cy,
    distortion.k1, distortion.k2, distortion.k3, distortion.p1, distortion.p2,
    Float64Array.from(cameraPose.rotation), Float64Array.from(cameraPose.translation),
    cameraFixed,
    Float64Array.from(landmark),
    Float64Array.from(observed),
    weight,
  );
  return {
    residual: [out[0]!, out[1]!],
    weight: out[2]!,
    cameraJacobian: out.slice(3, 15),
    landmarkJacobian: out.slice(15, 21),
    valid: out[21] === 1,
  };
}

/** Rust port of `bundle-optimizer.ts`'s `predictReduction` (ADR-013, Stage
 * 1) — the quadratic model's predicted cost reduction for a proposed
 * Schur-block step. `cameraHessian`/`landmarkHessian`/`cameraLandmark` are
 * row-major flat arrays; sizes come from `cameraStep`/`landmarkStep`
 * lengths, matching the TS function's own `.length`-based indexing. */
export function enginePredictReduction(
  cameraGradient: Float64Array,
  cameraHessian: Float64Array,
  landmarkGradient: Float64Array,
  landmarkHessian: Float64Array,
  cameraLandmark: Float64Array,
  cameraStep: Float64Array,
  landmarkStep: Float64Array,
): number {
  assertLoaded();
  return predict_reduction_wasm(cameraGradient, cameraHessian, landmarkGradient, landmarkHessian, cameraLandmark, cameraStep, landmarkStep);
}

/** Rust port of `bundle-optimizer.ts`'s per-residual `bundleCost`
 * accumulation (ADR-013, Stage 1) — takes already-computed
 * `[x, y, valid]` residual triples and weights, not a `BundleProblem` (the
 * `computeBundleResiduals` Map-lookup loop that produces them stays TS).
 * Throws for an invalid `huberDelta`, mirroring the TS `HuberLoss`
 * constructor. */
export function engineBundleCost(residuals: readonly (readonly [number, number, boolean])[], weights: readonly number[], huberDelta: number): number {
  assertLoaded();
  const flat = new Float64Array(residuals.length * 3);
  residuals.forEach(([x, y, valid], i) => { flat[i * 3] = x; flat[i * 3 + 1] = y; flat[i * 3 + 2] = valid ? 1 : 0; });
  const result = bundle_cost_wasm(flat, Float64Array.from(weights), huberDelta);
  if (Number.isNaN(result)) throw new Error("Huber delta must be positive.");
  return result;
}

/** Rust port of `bundle-optimizer.ts`'s `clampVector` (ADR-013, Stage 1). */
export function engineClampVector(vector: Float64Array, maxNorm: number): Float64Array {
  assertLoaded();
  return clamp_vector_wasm(vector, maxNorm);
}

/** Rust port of `bundle-adjustment.ts`'s `prepareBundleAdjustment` (ADR-013,
 * Stage 1). Returns `"not-run"`/`"insufficient"`, matching the TS
 * `BundleAdjustmentResult["status"]` values this function's callers check
 * (the `iterations`/`observationCount` fields stay TS-side bookkeeping). */
export function enginePrepareBundleAdjustment(landmarkCount: number, observationCount: number): "not-run" | "insufficient" {
  assertLoaded();
  return prepare_bundle_adjustment_wasm(landmarkCount, observationCount) ? "not-run" : "insufficient";
}

export interface EngineCameraPose { readonly rotation: EngineMat3; readonly translation: EngineVec3 }

/**
 * Batched Rust port of the camera-array half of `bundle-optimizer.ts`'s
 * `applyBundleStep` (ADR-013, Stage 1) — one WASM call for every camera at
 * once, not one call per camera, so the boundary-crossing count stays O(1)
 * regardless of how many cameras are being optimized (see
 * `crates/reconstruction/src/bundle_optimizer.rs`'s `apply_camera_steps`
 * module doc). `poses`/`cameraStep` must be in the same per-camera order
 * (the caller's `cameraIds` order); `cameraStep` is flat
 * `[rotation(3), translation(3)]` per camera.
 */
export function engineApplyCameraSteps(
  poses: readonly EngineCameraPose[],
  cameraStep: Float64Array,
  maxRotationStep: number,
  maxTranslationStep: number,
): EngineCameraPose[] {
  assertLoaded();
  const rotations = new Float64Array(poses.length * 9);
  const translations = new Float64Array(poses.length * 3);
  poses.forEach((pose, i) => { rotations.set(pose.rotation, i * 9); translations.set(pose.translation, i * 3); });
  const out = apply_camera_steps_wasm(rotations, translations, cameraStep, maxRotationStep, maxTranslationStep);
  const cameraCount = poses.length;
  return poses.map((_, i) => ({
    rotation: Array.from(out.slice(i * 9, i * 9 + 9)) as unknown as EngineMat3,
    translation: Array.from(out.slice(cameraCount * 9 + i * 3, cameraCount * 9 + i * 3 + 3)) as unknown as EngineVec3,
  }));
}

/**
 * Batched Rust port of the landmark-array half of `applyBundleStep`
 * (ADR-013, Stage 1) — same one-call-total rationale as
 * {@link engineApplyCameraSteps}. `landmarks`/`landmarkStep` are flat, 3
 * floats per landmark, in the caller's `landmarkIds` order.
 */
export function engineApplyLandmarkSteps(landmarks: Float64Array, landmarkStep: Float64Array, maxLandmarkStep: number): Float64Array {
  assertLoaded();
  return apply_landmark_steps_wasm(landmarks, landmarkStep, maxLandmarkStep);
}

export interface EngineObservationLinearizeInput {
  readonly intrinsics: EngineIntrinsics;
  readonly distortion: EngineDistortion;
  readonly cameraPose: EnginePose;
  readonly cameraFixed: boolean;
  readonly landmark: EngineVec3;
  readonly observed: readonly [number, number];
  readonly weight: number;
}

/**
 * Batched Rust port of `linearizeObservation` from `bundle-linearization.ts`
 * (ADR-013, Stage 1) — one WASM call for a whole observation list, not one
 * per observation (see `linearize_observations`'s Rust module doc for the
 * per-observation-frequency rationale). The camera/landmark `Map` lookups
 * that resolve each `EngineObservationLinearizeInput` from a
 * `BundleProblem` stay TS (`linearizeBundleRouted` in
 * `bundle-linearization.ts`).
 */
export function engineLinearizeObservations(inputs: readonly EngineObservationLinearizeInput[]): EngineObservationLinearization[] {
  assertLoaded();
  const n = inputs.length;
  const intrinsicsFlat = new Float64Array(n * 4);
  const distortionFlat = new Float64Array(n * 5);
  const rotationFlat = new Float64Array(n * 9);
  const translationFlat = new Float64Array(n * 3);
  const fixedFlat = new Float64Array(n);
  const landmarkFlat = new Float64Array(n * 3);
  const observedFlat = new Float64Array(n * 2);
  const weightFlat = new Float64Array(n);
  inputs.forEach((input, i) => {
    intrinsicsFlat.set([input.intrinsics.fx, input.intrinsics.fy, input.intrinsics.cx, input.intrinsics.cy], i * 4);
    distortionFlat.set([input.distortion.k1, input.distortion.k2, input.distortion.k3, input.distortion.p1, input.distortion.p2], i * 5);
    rotationFlat.set(input.cameraPose.rotation, i * 9);
    translationFlat.set(input.cameraPose.translation, i * 3);
    fixedFlat[i] = input.cameraFixed ? 1 : 0;
    landmarkFlat.set(input.landmark, i * 3);
    observedFlat.set(input.observed, i * 2);
    weightFlat[i] = input.weight;
  });
  const out = linearize_observations_batch_wasm(intrinsicsFlat, distortionFlat, rotationFlat, translationFlat, fixedFlat, landmarkFlat, observedFlat, weightFlat);
  const results: EngineObservationLinearization[] = [];
  for (let i = 0; i < n; i += 1) {
    const base = i * 22;
    results.push({
      residual: [out[base]!, out[base + 1]!],
      weight: out[base + 2]!,
      cameraJacobian: out.slice(base + 3, base + 15),
      landmarkJacobian: out.slice(base + 15, base + 21),
      valid: out[base + 21] === 1,
    });
  }
  return results;
}

export interface EngineAssemblyObservation {
  /** `undefined` when the observation's camera has no index in the
   * caller's camera list (absent, or — see the Rust module doc — fixed). */
  readonly cameraIndex: number | undefined;
  readonly landmarkIndex: number;
  readonly residual: readonly [number, number];
  readonly weight: number;
  readonly cameraJacobian: Float64Array;
  readonly landmarkJacobian: Float64Array;
}

/**
 * Batched Rust port of `bundle-block-assembly.ts`'s `assembleBundleBlocks`
 * (ADR-013, Stage 1) — the single most expensive per-observation step in
 * the bundle-adjustment loop, batched into one WASM call instead of one
 * per observation (see `assemble_bundle_blocks`'s Rust module doc,
 * including a pre-existing fixed-camera-skip quirk ported faithfully, not
 * fixed). Throws for an invalid `huberDelta`, mirroring the TS
 * `HuberLoss` constructor.
 */
export function engineAssembleBundleBlocks(
  observations: readonly EngineAssemblyObservation[],
  cameraCount: number,
  landmarkCount: number,
  damping: number,
  huberDelta: number,
): { readonly camera: EngineBlockMatrix; readonly cameraLandmark: EngineBlockMatrix; readonly landmark: EngineBlockMatrix; readonly cameraGradient: Float64Array; readonly landmarkGradient: Float64Array } {
  assertLoaded();
  const flat = new Float64Array(observations.length * 23);
  observations.forEach((obs, i) => {
    const base = i * 23;
    flat[base] = obs.cameraIndex ?? -1;
    flat[base + 1] = obs.landmarkIndex;
    flat[base + 2] = obs.residual[0];
    flat[base + 3] = obs.residual[1];
    flat[base + 4] = obs.weight;
    flat.set(obs.cameraJacobian, base + 5);
    flat.set(obs.landmarkJacobian, base + 17);
  });
  const out = assemble_bundle_blocks_wasm(flat, cameraCount, landmarkCount, damping, huberDelta);
  if (out.length === 0) throw new Error("Huber delta must be positive.");
  const cameraSize = cameraCount * 6;
  const landmarkSize = landmarkCount * 3;
  let cursor = 0;
  const camera = out.slice(cursor, cursor += cameraSize * cameraSize);
  const cameraLandmark = out.slice(cursor, cursor += cameraSize * landmarkSize);
  const landmark = out.slice(cursor, cursor += landmarkSize * landmarkSize);
  const cameraGradient = out.slice(cursor, cursor += cameraSize);
  const landmarkGradient = out.slice(cursor, cursor += landmarkSize);
  return {
    camera: { rows: cameraSize, columns: cameraSize, values: camera },
    cameraLandmark: { rows: cameraSize, columns: landmarkSize, values: cameraLandmark },
    landmark: { rows: landmarkSize, columns: landmarkSize, values: landmark },
    cameraGradient,
    landmarkGradient,
  };
}
