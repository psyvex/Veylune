import type { BundleOptimizationResult } from "./bundle-optimizer";
import type { LocalMap, LocalMapSnapshot } from "./map";
import { validateSnapshot } from "./map";
import { beginMapTransaction, commitMapTransaction } from "./map-transaction";

export interface BundleCommitPolicy {
  readonly minRelativeImprovement: number;
  readonly maxLandmarkDelta: number;
  readonly maxDepthChangeRatio: number;
}

export const DEFAULT_BUNDLE_COMMIT_POLICY: BundleCommitPolicy = {
  minRelativeImprovement: 1e-4,
  maxLandmarkDelta: 1,
  maxDepthChangeRatio: 0.5,
};

export interface BundleCommitResult {
  readonly committed: boolean;
  readonly reason:
    | "committed"
    | "optimizer-rejected"
    | "no-improvement"
    | "invalid-result"
    | "unsafe-landmark-update"
    | "conflict";
}

export function commitBundleOptimization(
  map: LocalMap,
  result: BundleOptimizationResult,
  policy: BundleCommitPolicy = DEFAULT_BUNDLE_COMMIT_POLICY,
): BundleCommitResult {
  if (!Number.isFinite(policy.minRelativeImprovement) || policy.minRelativeImprovement < 0 ||
      !Number.isFinite(policy.maxLandmarkDelta) || policy.maxLandmarkDelta <= 0 ||
      !Number.isFinite(policy.maxDepthChangeRatio) || policy.maxDepthChangeRatio < 0) {
    return { committed: false, reason: "invalid-result" };
  }
  if (result.status !== "converged" || !Number.isFinite(result.initialCost) || !Number.isFinite(result.finalCost)) {
    return { committed: false, reason: "optimizer-rejected" };
  }
  if (result.initialCost <= 0 || result.finalCost >= result.initialCost) {
    return { committed: false, reason: "no-improvement" };
  }
  const relativeImprovement = (result.initialCost - result.finalCost) / result.initialCost;
  if (relativeImprovement < policy.minRelativeImprovement) return { committed: false, reason: "no-improvement" };

  const transaction = beginMapTransaction(map);
  const candidate = mergeOptimizedLandmarks(transaction.candidate, result.problem, policy);
  if (!candidate || !validateSnapshot(candidate)) return { committed: false, reason: "unsafe-landmark-update" };
  return commitMapTransaction(map, transaction, candidate)
    ? { committed: true, reason: "committed" }
    : { committed: false, reason: "conflict" };
}

function mergeOptimizedLandmarks(
  snapshot: LocalMapSnapshot,
  problem: BundleOptimizationResult["problem"],
  policy: BundleCommitPolicy,
): LocalMapSnapshot | undefined {
  const optimized = new Map(problem.landmarks.map((landmark) => [landmark.id, landmark]));
  const landmarks = snapshot.landmarks.map((landmark) => {
    const next = optimized.get(landmark.id);
    if (!next) return landmark;
    const delta = Math.hypot(next.x - landmark.x, next.y - landmark.y, next.z - landmark.z);
    const depthRatio = landmark.z > 0 ? Math.abs(next.z - landmark.z) / landmark.z : Infinity;
    if (!Number.isFinite(delta) || !Number.isFinite(depthRatio) || delta > policy.maxLandmarkDelta || depthRatio > policy.maxDepthChangeRatio || next.z <= 0) return undefined;
    return { ...landmark, x: next.x, y: next.y, z: next.z };
  });
  if (landmarks.some((landmark) => landmark === undefined)) return undefined;
  return { ...snapshot, landmarks: landmarks as LocalMapSnapshot["landmarks"] };
}
