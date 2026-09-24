import type { BundleProblem } from "./bundle-problem";
import { computeBundleResiduals } from "./bundle-problem";
import { linearizeBundle } from "./bundle-linearization";
import { assembleBundleBlocks } from "./bundle-block-assembly";
import { solveBundleSchurBlocks } from "./schur-block-solve";
import { applySE3Increment } from "./se3";
import { HuberLoss } from "./robust-loss";

export interface BundleOptimizerOptions { readonly maxIterations: number; readonly initialDamping: number; readonly minDamping: number; readonly maxDamping: number; readonly convergenceCost: number; readonly convergenceStep: number; readonly maxTranslationStep: number; readonly maxRotationStep: number; readonly maxLandmarkStep: number; readonly shouldCancel?: () => boolean; readonly onProgress?: (progress: { readonly iteration: number; readonly total: number; readonly cost: number }) => void; }
export interface BundleOptimizationResult { readonly status: "converged" | "rejected" | "insufficient" | "cancelled"; readonly iterations: number; readonly initialCost: number; readonly finalCost: number; readonly problem: BundleProblem; }
const DEFAULT_OPTIONS: BundleOptimizerOptions = { maxIterations: 8, initialDamping: 1e-3, minDamping: 1e-8, maxDamping: 1e6, convergenceCost: 1e-6, convergenceStep: 1e-5, maxTranslationStep: 0.25, maxRotationStep: 0.15, maxLandmarkStep: 0.25 };
export function optimizeBundle(input: BundleProblem, options: Partial<BundleOptimizerOptions> = {}): BundleOptimizationResult {
  const config = { ...DEFAULT_OPTIONS, ...options };
  let problem = cloneProblem(input); let damping = config.initialDamping; let rejectionScale = 2; let acceptedSteps = 0; let currentCost = bundleCost(problem);
  if (!Number.isFinite(currentCost) || input.cameras.filter((camera) => camera.fixed).length === 0) return { status: "insufficient", iterations: 0, initialCost: currentCost, finalCost: currentCost, problem: input };
  const initialCost = currentCost;
  for (let iteration = 0; iteration < config.maxIterations; iteration += 1) {
    if (config.shouldCancel?.()) return { status: "cancelled", iterations: iteration, initialCost, finalCost: currentCost, problem };
    config.onProgress?.({ iteration, total: config.maxIterations, cost: currentCost });
    const linearization = linearizeBundle(problem);
    if (linearization.observations.length < 4 || linearization.cameraIds.length === 0) return { status: "insufficient", iterations: iteration, initialCost, finalCost: currentCost, problem: input };
    const blocks = assembleBundleBlocks(linearization); const solved = solveBundleSchurBlocks(blocks, damping);
    if (solved.status !== "solved") { damping = Math.min(config.maxDamping, damping * rejectionScale); rejectionScale *= 2; if (damping >= config.maxDamping) return { status: acceptedSteps > 0 ? "converged" : "rejected", iterations: iteration + 1, initialCost, finalCost: currentCost, problem }; continue; }
    const candidate = applyBundleStep(problem, linearization.cameraIds, linearization.landmarkIds, solved.cameraStep, solved.landmarkStep, config); const candidateCost = bundleCost(candidate);
    const predictedReduction = predictReduction(blocks, solved.cameraStep, solved.landmarkStep);
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
function bundleCost(problem: BundleProblem): number { const loss = new HuberLoss(2); let cost = 0; for (const residual of computeBundleResiduals(problem)) { if (!residual.valid) return Infinity; cost += loss.rhoSquared(residual.residualX ** 2 + residual.residualY ** 2); } return cost; }
function predictReduction(blocks: ReturnType<typeof assembleBundleBlocks>, cameraStep: Float64Array, landmarkStep: Float64Array): number {
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
function applyBundleStep(problem: BundleProblem, cameraIds: readonly string[], landmarkIds: readonly string[], cameraStep: Float64Array, landmarkStep: Float64Array, options: BundleOptimizerOptions): BundleProblem { return { ...problem, cameras: problem.cameras.map((camera) => { const index = cameraIds.indexOf(camera.id); if (index < 0) return camera; const offset = index * 6; const rotation = clampVector(cameraStep.slice(offset, offset + 3), options.maxRotationStep); const translation = clampVector(cameraStep.slice(offset + 3, offset + 6), options.maxTranslationStep); return { ...camera, pose: applySE3Increment(camera.pose.rotation, camera.pose.translation, { rotation: [rotation[0]!, rotation[1]!, rotation[2]!], translation: [translation[0]!, translation[1]!, translation[2]!] }) }; }), landmarks: problem.landmarks.map((landmark) => { const index = landmarkIds.indexOf(landmark.id); if (index < 0) return landmark; const offset = index * 3; const step = clampVector(landmarkStep.slice(offset, offset + 3), options.maxLandmarkStep); return { ...landmark, x: landmark.x + step[0]!, y: landmark.y + step[1]!, z: Math.max(1e-5, landmark.z + step[2]!) }; }) }; }
function cloneProblem(problem: BundleProblem): BundleProblem { return { cameras: problem.cameras.map((camera) => ({ ...camera, pose: { rotation: [...camera.pose.rotation] as typeof camera.pose.rotation, translation: [...camera.pose.translation] as typeof camera.pose.translation } })), landmarks: problem.landmarks.map((landmark) => ({ ...landmark })), observations: problem.observations.map((observation) => ({ ...observation })) }; }
function clampVector(vector: Float64Array, maxNorm: number): Float64Array { const magnitude = norm(vector); if (magnitude <= maxNorm || magnitude === 0) return vector; const scale = maxNorm / magnitude; return vector.map((value) => value * scale); }
function norm(vector: Float64Array): number { return Math.hypot(...vector); }
