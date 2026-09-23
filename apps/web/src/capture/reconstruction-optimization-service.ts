import type { BundleOptimizerOptions } from "./bundle-optimizer";
import { optimizeReconstructionSession } from "./reconstruction-optimizer";
import type { ReconstructionStateStore } from "./reconstruction-state";

export interface ReconstructionOptimizationCommitResult {
  readonly status: "committed" | "rejected" | "insufficient" | "conflict";
  readonly initialCost: number;
  readonly finalCost: number;
  readonly iterations: number;
}

export function optimizeAndCommitReconstruction(store: ReconstructionStateStore, options?: BundleOptimizerOptions): ReconstructionOptimizationCommitResult {
  const snapshot = store.snapshot();
  const result = optimizeReconstructionSession(snapshot, options);
  if (result.status !== "committed" || !result.candidate) {
    return { status: result.status, initialCost: result.optimization.initialCost, finalCost: result.optimization.finalCost, iterations: result.optimization.iterations };
  }
  const committed = store.commit({ expectedMapVersion: snapshot.map.version, expectedPoseVersion: snapshot.poses.version, snapshot: result.candidate });
  return { status: committed ? "committed" : "conflict", initialCost: result.optimization.initialCost, finalCost: result.optimization.finalCost, iterations: result.optimization.iterations };
}
