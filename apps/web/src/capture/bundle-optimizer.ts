import type { BundleProblem } from "./bundle-problem";
import { computeBundleResiduals, computeBundleResidualsRouted } from "./bundle-problem";
import { linearizeBundleRouted } from "./bundle-linearization";
import { assembleBundleBlocksRouted } from "./bundle-block-assembly";
import { solveBundleSchurBlocks, type SchurBlockSolveResult } from "./schur-block-solve";
import type { SchurBlocks } from "./schur-blocks";
import { applySE3Increment } from "./se3";
import { HuberLoss } from "./robust-loss";
import { enginePredictReduction, engineSolveBundleSchurBlocks, engineApplyCameraSteps, engineApplyLandmarkSteps, engineBundleCost } from "../engine/index.js";
import { isReconstructionEngineReady } from "./reconstruction-engine-bootstrap.js";

/**
 * The first live caller switched to the WASM math (ADR-013, Stage 1 task
 * 13): once per Levenberg-Marquardt iteration, not once per point, so
 * marshaling overhead is negligible — see
 * `docs/75-production-task-pipeline.md` task 13's notes on why this was
 * chosen as the lowest-risk first swap. Falls back to the pure-TS
 * `solveBundleSchurBlocks` whenever the engine isn't loaded yet (offline,
 * blocked CDN, no WASM support, or simply hasn't settled yet) — both paths
 * are proven numerically identical by `bundle-optimizer-wasm-parity.test.ts`.
 */
function solveSchurBlocks(blocks: SchurBlocks, damping: number): SchurBlockSolveResult {
  return isReconstructionEngineReady() ? engineSolveBundleSchurBlocks(blocks, damping) : solveBundleSchurBlocks(blocks, damping);
}

/**
 * Same routing as {@link solveSchurBlocks}, for the once-per-iteration
 * `predictReduction` call. `predictReduction` itself stays the plain TS
 * export — `bundle-optimizer-wasm-parity.test.ts` calls it directly to
 * compare against the WASM version, so it must not become router logic.
 */
function predictReductionRouted(blocks: SchurBlocks, cameraStep: Float64Array, landmarkStep: Float64Array): number {
  return isReconstructionEngineReady()
    ? enginePredictReduction(blocks.cameraGradient, blocks.camera.values, blocks.landmarkGradient, blocks.landmark.values, blocks.cameraLandmark.values, cameraStep, landmarkStep)
    : predictReduction(blocks, cameraStep, landmarkStep);
}

export interface BundleOptimizerOptions { readonly maxIterations: number; readonly initialDamping: number; readonly minDamping: number; readonly maxDamping: number; readonly convergenceCost: number; readonly convergenceStep: number; readonly maxTranslationStep: number; readonly maxRotationStep: number; readonly maxLandmarkStep: number; readonly huberDelta: number; readonly shouldCancel?: () => boolean; readonly onProgress?: (progress: { readonly iteration: number; readonly total: number; readonly cost: number }) => void; }
export interface BundleOptimizationResult { readonly status: "converged" | "rejected" | "insufficient" | "cancelled"; readonly iterations: number; readonly initialCost: number; readonly finalCost: number; readonly problem: BundleProblem; }
const DEFAULT_OPTIONS: BundleOptimizerOptions = { maxIterations: 8, initialDamping: 1e-3, minDamping: 1e-8, maxDamping: 1e6, convergenceCost: 1e-6, convergenceStep: 1e-5, maxTranslationStep: 0.25, maxRotationStep: 0.15, maxLandmarkStep: 0.25, huberDelta: 2 };
export function optimizeBundle(input: BundleProblem, options: Partial<BundleOptimizerOptions> = {}): BundleOptimizationResult {
  const config = { ...DEFAULT_OPTIONS, ...options };
  let problem = cloneProblem(input); let damping = config.initialDamping; let rejectionScale = 2; let acceptedSteps = 0; let currentCost = bundleCostRouted(problem, config.huberDelta);
  if (!Number.isFinite(currentCost) || input.cameras.filter((camera) => camera.fixed).length === 0) return { status: "insufficient", iterations: 0, initialCost: currentCost, finalCost: currentCost, problem: input };
  const initialCost = currentCost;
  for (let iteration = 0; iteration < config.maxIterations; iteration += 1) {
    if (config.shouldCancel?.()) return { status: "cancelled", iterations: iteration, initialCost, finalCost: currentCost, problem };
    config.onProgress?.({ iteration, total: config.maxIterations, cost: currentCost });
    const linearization = linearizeBundleRouted(problem);
    if (linearization.observations.length < 4 || linearization.cameraIds.length === 0) return { status: "insufficient", iterations: iteration, initialCost, finalCost: currentCost, problem: input };
    const blocks = assembleBundleBlocksRouted(linearization, 0, config.huberDelta); const solved = solveSchurBlocks(blocks, damping);
    if (solved.status !== "solved") { damping = Math.min(config.maxDamping, damping * rejectionScale); rejectionScale *= 2; if (damping >= config.maxDamping) return { status: acceptedSteps > 0 ? "converged" : "rejected", iterations: iteration + 1, initialCost, finalCost: currentCost, problem }; continue; }
    const candidate = applyBundleStepRouted(problem, linearization.cameraIds, linearization.landmarkIds, solved.cameraStep, solved.landmarkStep, config); const candidateCost = bundleCostRouted(candidate, config.huberDelta);
    const predictedReduction = predictReductionRouted(blocks, solved.cameraStep, solved.landmarkStep);
    const actualReduction = currentCost - candidateCost;
    const gainRatio = predictedReduction > 0 ? actualReduction / predictedReduction : Number.NEGATIVE_INFINITY;
    if (!Number.isFinite(candidateCost) || actualReduction <= 0 || gainRatio <= 0) {
      damping = Math.min(config.maxDamping, damping * rejectionScale);
      rejectionScale *= 2;
      if (damping >= config.maxDamping) return { status: acceptedSteps > 0 ? "converged" : "rejected", iterations: iteration + 1, initialCost, finalCost: currentCost, problem };
      continue;
    }
    const improvement = actualReduction; const stepNorm = Math.max(norm(solved.cameraStep), norm(solved.landmarkStep));
    problem = candidate; currentCost = candidateCost; acceptedSteps += 1;
    damping = Math.max(config.minDamping, damping * Math.max(1 / 3, 1 - (2 * gainRatio - 1) ** 3));
    rejectionScale = 2;
    if (improvement <= config.convergenceCost || stepNorm <= config.convergenceStep) return { status: "converged", iterations: iteration + 1, initialCost, finalCost: currentCost, problem };
  }
  config.onProgress?.({ iteration: config.maxIterations, total: config.maxIterations, cost: currentCost });
  return { status: "converged", iterations: config.maxIterations, initialCost, finalCost: currentCost, problem };
}
/** Exported for `bundle-optimizer-wasm-parity.test.ts`. */
export function bundleCost(problem: BundleProblem, huberDelta: number): number { const loss = new HuberLoss(huberDelta); let cost = 0; const residuals = computeBundleResiduals(problem); for (let index = 0; index < residuals.length; index += 1) { const residual = residuals[index]!; const observation = problem.observations[index]!; const weight = observation.weight ?? 1; if (!residual.valid || !Number.isFinite(weight) || weight <= 0) return Infinity; cost += loss.rhoSquared(weight * (residual.residualX ** 2 + residual.residualY ** 2)); } return cost; }

/**
 * Routes `bundleCost` to a single `engineBundleCost` call (ADR-013, Stage
 * 1) — `computeBundleResiduals`'s `Map`-lookup loop stays TS (that's
 * orchestration over `BundleProblem`'s string ids, not math), but the
 * per-residual Huber accumulation over its *output* is one WASM call per
 * `bundleCost` invocation, not one per residual, matching the batching
 * rationale in `apply_camera_steps`. `engineBundleCost` throws on an
 * invalid `huberDelta`, mirroring `new HuberLoss(huberDelta)`'s throw in
 * the pure-TS path, so no extra error handling is needed here. Falls back
 * to the pure-TS `bundleCost` when the engine isn't ready.
 */
function bundleCostRouted(problem: BundleProblem, huberDelta: number): number {
  if (!isReconstructionEngineReady()) return bundleCost(problem, huberDelta);
  const residuals = computeBundleResidualsRouted(problem);
  const triples: (readonly [number, number, boolean])[] = residuals.map((residual) => [residual.residualX, residual.residualY, residual.valid] as const);
  const weights = problem.observations.map((observation) => observation.weight ?? 1);
  return engineBundleCost(triples, weights, huberDelta);
}
/** Exported for `bundle-optimizer-wasm-parity.test.ts` — otherwise this is
 * only called internally by `optimizeBundle`. */
export function predictReduction(blocks: SchurBlocks, cameraStep: Float64Array, landmarkStep: Float64Array): number {
  let linear = 0; let quadratic = 0;
  for (let i = 0; i < cameraStep.length; i += 1) {
    linear += blocks.cameraGradient[i]! * cameraStep[i]!;
    for (let j = 0; j < cameraStep.length; j += 1) quadratic += 0.5 * cameraStep[i]! * blocks.camera.values[i * cameraStep.length + j]! * cameraStep[j]!;
  }
  for (let i = 0; i < landmarkStep.length; i += 1) {
    linear += blocks.landmarkGradient[i]! * landmarkStep[i]!;
    for (let j = 0; j < landmarkStep.length; j += 1) quadratic += 0.5 * landmarkStep[i]! * blocks.landmark.values[i * landmarkStep.length + j]! * landmarkStep[j]!;
  }
  for (let i = 0; i < cameraStep.length; i += 1) for (let j = 0; j < landmarkStep.length; j += 1) {
    quadratic += cameraStep[i]! * blocks.cameraLandmark.values[i * landmarkStep.length + j]! * landmarkStep[j]!;
  }
  return -(linear + quadratic);
}
/**
 * camera.pose.translation is the camera's world-space CENTER, not a
 * standard world-to-camera `t` (see reprojection.ts's projectPoint) — so
 * unlike `applySE3Increment`'s SE3 group update (`t_new = ΔR*t + Δt`,
 * correct for a standard `t`), the center's Gauss-Newton step is a plain
 * world-frame add (`C_new = C + step`), matching linearizeObservation's
 * `d(q)/d(center) = -R` Jacobian (which was itself derived assuming this
 * additive update, not the SE3-composed one). The rotation update is
 * unchanged — `so3Exp(step)` left-multiplied onto the rotation is correct
 * for either translation convention, since it only concerns R.
 */
function applyBundleStep(problem: BundleProblem, cameraIds: readonly string[], landmarkIds: readonly string[], cameraStep: Float64Array, landmarkStep: Float64Array, options: BundleOptimizerOptions): BundleProblem { return { ...problem, cameras: problem.cameras.map((camera) => { const index = cameraIds.indexOf(camera.id); if (index < 0) return camera; const offset = index * 6; const rotationStep = clampVector(cameraStep.slice(offset, offset + 3), options.maxRotationStep); const translationStep = clampVector(cameraStep.slice(offset + 3, offset + 6), options.maxTranslationStep); const rotatedOnly = applySE3Increment(camera.pose.rotation, [0, 0, 0], { rotation: [rotationStep[0]!, rotationStep[1]!, rotationStep[2]!], translation: [0, 0, 0] }); return { ...camera, pose: { rotation: rotatedOnly.rotation, translation: [camera.pose.translation[0] + translationStep[0]!, camera.pose.translation[1] + translationStep[1]!, camera.pose.translation[2] + translationStep[2]!] } }; }), landmarks: problem.landmarks.map((landmark) => { const index = landmarkIds.indexOf(landmark.id); if (index < 0) return landmark; const offset = index * 3; const step = clampVector(landmarkStep.slice(offset, offset + 3), options.maxLandmarkStep); return { ...landmark, x: landmark.x + step[0]!, y: landmark.y + step[1]!, z: Math.max(1e-5, landmark.z + step[2]!) }; }) }; }

/**
 * Routes `applyBundleStep`'s array math to the batched WASM functions
 * (ADR-013, Stage 1) — one `engineApplyCameraSteps` call for every non-fixed
 * camera and one `engineApplyLandmarkSteps` call for every landmark,
 * instead of one WASM call per camera/landmark (which at real capture sizes
 * — thousands of landmarks — would mean thousands of boundary crossings per
 * iteration; see `apply_camera_steps`'s Rust module doc). `cameraIds` is
 * exactly `problem.cameras.filter(c => !c.fixed)` in order (that's how
 * `linearizeBundle` built it from this same `problem`), so the non-fixed
 * subset can be sliced out and zipped back positionally without an
 * `indexOf` lookup per camera. `landmarkIds` is unfiltered and in
 * `problem.landmarks`'s own order, so every landmark maps 1:1 by position.
 * Falls back to the pure-TS `applyBundleStep` when the engine isn't ready.
 */
function applyBundleStepRouted(problem: BundleProblem, cameraIds: readonly string[], landmarkIds: readonly string[], cameraStep: Float64Array, landmarkStep: Float64Array, options: BundleOptimizerOptions): BundleProblem {
  if (!isReconstructionEngineReady()) return applyBundleStep(problem, cameraIds, landmarkIds, cameraStep, landmarkStep, options);

  const nonFixedCameras = problem.cameras.filter((camera) => !camera.fixed);
  const updatedPoses = engineApplyCameraSteps(nonFixedCameras.map((camera) => camera.pose), cameraStep, options.maxRotationStep, options.maxTranslationStep);
  let cursor = 0;
  const cameras = problem.cameras.map((camera) => camera.fixed ? camera : { ...camera, pose: updatedPoses[cursor++]! });

  const flatLandmarks = new Float64Array(problem.landmarks.length * 3);
  problem.landmarks.forEach((landmark, i) => { flatLandmarks[i * 3] = landmark.x; flatLandmarks[i * 3 + 1] = landmark.y; flatLandmarks[i * 3 + 2] = landmark.z; });
  const updatedFlat = engineApplyLandmarkSteps(flatLandmarks, landmarkStep, options.maxLandmarkStep);
  const landmarks = problem.landmarks.map((landmark, i) => ({ ...landmark, x: updatedFlat[i * 3]!, y: updatedFlat[i * 3 + 1]!, z: updatedFlat[i * 3 + 2]! }));

  return { ...problem, cameras, landmarks };
}
function cloneProblem(problem: BundleProblem): BundleProblem { return { cameras: problem.cameras.map((camera) => ({ ...camera, pose: { rotation: [...camera.pose.rotation] as typeof camera.pose.rotation, translation: [...camera.pose.translation] as typeof camera.pose.translation } })), landmarks: problem.landmarks.map((landmark) => ({ ...landmark })), observations: problem.observations.map((observation) => ({ ...observation })) }; }
/** Exported for `bundle-optimizer-wasm-parity.test.ts`. */
export function clampVector(vector: Float64Array, maxNorm: number): Float64Array { const magnitude = norm(vector); if (magnitude <= maxNorm || magnitude === 0) return vector; const scale = maxNorm / magnitude; return vector.map((value) => value * scale); }
function norm(vector: Float64Array): number { return Math.hypot(...vector); }
