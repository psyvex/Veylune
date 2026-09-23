import type { BundleProblem } from "./bundle-problem";
import { computeBundleResiduals } from "./bundle-problem";
import { linearizeBundle } from "./bundle-linearization";
import { assembleBundleBlocks } from "./bundle-block-assembly";
import { solveBundleSchurBlocks } from "./schur-block-solve";
import { applySE3Increment } from "./se3";
import { HuberLoss } from "./robust-loss";

export interface BundleOptimizerOptions {
  readonly maxIterations: number;
  readonly initialDamping: number;
  readonly minDamping: number;
  readonly maxDamping: number;
  readonly convergenceCost: number;
  readonly convergenceStep: number;
  readonly maxTranslationStep: number;
  readonly maxRotationStep: number;
  readonly maxLandmarkStep: number;
}

export interface BundleOptimizationResult {
  readonly status: "converged" | "rejected" | "insufficient";
  readonly iterations: number;
  readonly initialCost: number;
  readonly finalCost: number;
  readonly problem: BundleProblem;
}

const DEFAULT_OPTIONS: BundleOptimizerOptions = {
  maxIterations: 8,
  initialDamping: 1e-3,
  minDamping: 1e-8,
  maxDamping: 1e6,
  convergenceCost: 1e-6,
  convergenceStep: 1e-5,
  maxTranslationStep: 0.25,
  maxRotationStep: 0.15,
  maxLandmarkStep: 0.25,
};

export function optimizeBundle(
  input: BundleProblem,
  options: BundleOptimizerOptions = DEFAULT_OPTIONS,
): BundleOptimizationResult {
  let problem = cloneProblem(input);
  let damping = options.initialDamping;
  let currentCost = bundleCost(problem);
  if (!Number.isFinite(currentCost) || input.cameras.filter((camera) => camera.fixed).length === 0) {
    return { status: "insufficient", iterations: 0, initialCost: currentCost, finalCost: currentCost, problem: input };
  }
  const initialCost = currentCost;

  for (let iteration = 0; iteration < options.maxIterations; iteration += 1) {
    const linearization = linearizeBundle(problem);
    if (linearization.observations.length < 4 || linearization.cameraIds.length === 0) {
      return { status: "insufficient", iterations: iteration, initialCost, finalCost: currentCost, problem: input };
    }
    const blocks = assembleBundleBlocks(linearization, damping);
    const solved = solveBundleSchurBlocks(blocks, damping);
    if (solved.status !== "solved") {
      damping = Math.min(options.maxDamping, damping * 10);
      if (damping >= options.maxDamping) return { status: "rejected", iterations: iteration + 1, initialCost, finalCost: currentCost, problem: input };
      continue;
    }

    const candidate = applyBundleStep(problem, linearization.cameraIds, linearization.landmarkIds, solved.cameraStep, solved.landmarkStep, options);
    const candidateCost = bundleCost(candidate);
    if (!Number.isFinite(candidateCost) || candidateCost >= currentCost) {
      damping = Math.min(options.maxDamping, damping * 4);
      continue;
    }

    const improvement = currentCost - candidateCost;
    const stepNorm = Math.max(norm(solved.cameraStep), norm(solved.landmarkStep));
    problem = candidate;
    currentCost = candidateCost;
    damping = Math.max(options.minDamping, damping / 3);

    if (improvement <= options.convergenceCost || stepNorm <= options.convergenceStep) {
      return { status: "converged", iterations: iteration + 1, initialCost, finalCost: currentCost, problem };
    }
  }

  return { status: "converged", iterations: options.maxIterations, initialCost, finalCost: currentCost, problem };
}

function bundleCost(problem: BundleProblem): number {
  const loss = new HuberLoss(2);
  let cost = 0;
  for (const residual of computeBundleResiduals(problem)) {
    if (!residual.valid) return Infinity;
    cost += loss.rhoSquared(residual.residualX ** 2 + residual.residualY ** 2);
  }
  return cost;
}

function applyBundleStep(
  problem: BundleProblem,
  cameraIds: readonly string[],
  landmarkIds: readonly string[],
  cameraStep: Float64Array,
  landmarkStep: Float64Array,
  options: BundleOptimizerOptions,
): BundleProblem {
  return {
    ...problem,
    cameras: problem.cameras.map((camera) => {
      const index = cameraIds.indexOf(camera.id);
      if (index < 0) return camera;
      const offset = index * 6;
      const rotation = clampVector(cameraStep.slice(offset, offset + 3), options.maxRotationStep);
      const translation = clampVector(cameraStep.slice(offset + 3, offset + 6), options.maxTranslationStep);
      return { ...camera, pose: applySE3Increment(camera.pose.rotation, camera.pose.translation, { rotation: [rotation[0]!, rotation[1]!, rotation[2]!], translation: [translation[0]!, translation[1]!, translation[2]!] }) };
    }),
    landmarks: problem.landmarks.map((landmark) => {
      const index = landmarkIds.indexOf(landmark.id);
      if (index < 0) return landmark;
      const offset = index * 3;
      const step = clampVector(landmarkStep.slice(offset, offset + 3), options.maxLandmarkStep);
      return { ...landmark, x: landmark.x + step[0]!, y: landmark.y + step[1]!, z: Math.max(1e-5, landmark.z + step[2]!) };
    }),
  };
}

function cloneProblem(problem: BundleProblem): BundleProblem {
  return {
    cameras: problem.cameras.map((camera) => ({ ...camera, pose: { rotation: [...camera.pose.rotation] as typeof camera.pose.rotation, translation: [...camera.pose.translation] as typeof camera.pose.translation } })),
    landmarks: problem.landmarks.map((landmark) => ({ ...landmark })),
    observations: problem.observations.map((observation) => ({ ...observation })),
  };
}

function clampVector(vector: Float64Array, maxNorm: number): Float64Array {
  const magnitude = norm(vector);
  if (magnitude <= maxNorm || magnitude === 0) return vector;
  const scale = maxNorm / magnitude;
  return vector.map((value) => value * scale);
}

function norm(vector: Float64Array): number { return Math.hypot(...vector); }
