import { optimizeReconstructionSession, type ReconstructionOptimizationResult } from "./reconstruction-optimizer";
import type { ReconstructionSessionSnapshot } from "./reconstruction-session";

export interface ReconstructionWorkerInput { readonly session: ReconstructionSessionSnapshot; readonly maxIterations?: number; }
export type ReconstructionWorkerOutput = { readonly candidate: ReconstructionSessionSnapshot; readonly iterations: number; readonly initialCost: number; readonly finalCost: number };

export function executeReconstructionWorker(input: ReconstructionWorkerInput): ReconstructionWorkerOutput {
  const result: ReconstructionOptimizationResult = optimizeReconstructionSession(input.session, { maxIterations: input.maxIterations ?? 5 });
  if (result.status !== "committed" || !result.candidate) throw new Error(result.status === "insufficient" ? "Reconstruction state is insufficient for optimization." : "Optimization did not produce an improving solution.");
  return { candidate: result.candidate, iterations: result.optimization.iterations, initialCost: result.optimization.initialCost, finalCost: result.optimization.finalCost };
}

export function installReconstructionWorker(scope: Pick<WorkerGlobalScope, "addEventListener" | "postMessage">): void {
  scope.addEventListener("message", (event: MessageEvent<unknown>) => {
    const message = event.data as { type?: unknown; id?: unknown; input?: unknown };
    if (message?.type !== "submit" || typeof message.id !== "string" || !isInput(message.input)) return;
    try { scope.postMessage({ type: "completed", status: { id: message.id, state: "completed", progress: { completed: 1, total: 1 } }, output: executeReconstructionWorker(message.input) }); }
    catch (error) { scope.postMessage({ type: "failed", status: { id: message.id, state: "failed", progress: { completed: 0, total: 1 }, error: { code: "RECONSTRUCTION_FAILED", message: error instanceof Error ? error.message : "Reconstruction worker failed.", retryable: true } } }); }
  });
}

function isInput(value: unknown): value is ReconstructionWorkerInput { if (!value || typeof value !== "object") return false; const candidate = value as Record<string, unknown>; return Boolean(candidate.session && typeof candidate.session === "object") && (candidate.maxIterations === undefined || (Number.isSafeInteger(candidate.maxIterations) && candidate.maxIterations > 0 && candidate.maxIterations <= 100)); }
