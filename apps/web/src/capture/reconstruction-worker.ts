import { optimizeReconstructionSession, type ReconstructionOptimizationResult } from "./reconstruction-optimizer";
import type { ReconstructionSessionSnapshot } from "./reconstruction-session";
export interface ReconstructionWorkerInput { readonly session: ReconstructionSessionSnapshot; readonly maxIterations?: number; }
export type ReconstructionWorkerOutput = { readonly candidate: ReconstructionSessionSnapshot; readonly iterations: number; readonly initialCost: number; readonly finalCost: number };
export interface ReconstructionWorkerScope { addEventListener(type: "message", listener: (event: MessageEvent<unknown>) => void): void; postMessage(message: unknown): void; }
export function executeReconstructionWorker(input: ReconstructionWorkerInput, shouldCancel?: () => boolean, onProgress?: (progress: { iteration: number; total: number; cost: number; initialCost?: number; improvement?: number }) => void): ReconstructionWorkerOutput {
  const result: ReconstructionOptimizationResult = optimizeReconstructionSession(input.session, { maxIterations: input.maxIterations ?? 5, ...(shouldCancel ? { shouldCancel } : {}), ...(onProgress ? { onProgress } : {}) });
  if (result.status === "cancelled") throw new ReconstructionCancelledError();
  if (result.status !== "committed" || !result.candidate) throw new Error(result.status === "insufficient" ? "Reconstruction state is insufficient for optimization." : "Optimization did not produce an improving solution.");
  return { candidate: result.candidate, iterations: result.optimization.iterations, initialCost: result.optimization.initialCost, finalCost: result.optimization.finalCost };
}
export class ReconstructionCancelledError extends Error { constructor() { super("Reconstruction optimization cancelled."); this.name = "ReconstructionCancelledError"; } }
export function installReconstructionWorker(scope: ReconstructionWorkerScope): void {
  const cancelled = new Set<string>();
  scope.addEventListener("message", (event) => {
    const message = event.data as { type?: unknown; id?: unknown; input?: unknown };
    if (message?.type === "cancel" && typeof message.id === "string") { cancelled.add(message.id); return; }
    if (message?.type !== "submit" || typeof message.id !== "string" || !isInput(message.input)) return;
    const id = message.id;
    try {
      let initialCost: number | undefined;
      const output = executeReconstructionWorker(message.input, () => cancelled.has(id), (progress) => {
        initialCost ??= progress.initialCost;
        scope.postMessage({ type: "progress", status: { id, state: "running", progress: { completed: Math.min(progress.iteration, progress.total), total: progress.total, cost: progress.cost, initialCost, improvement: initialCost === undefined ? undefined : initialCost - progress.cost } } });
      });
      if (cancelled.has(id)) { cancelled.delete(id); scope.postMessage({ type: "cancelled", status: { id, state: "cancelled", progress: { completed: output.iterations, total: output.iterations, cost: output.finalCost, initialCost: output.initialCost, improvement: output.initialCost - output.finalCost } } }); return; }
      scope.postMessage({ type: "completed", status: { id, state: "completed", progress: { completed: output.iterations, total: output.iterations, cost: output.finalCost, initialCost: output.initialCost, improvement: output.initialCost - output.finalCost } }, output });
    } catch (error) {
      const wasCancelled = error instanceof ReconstructionCancelledError || cancelled.has(id); cancelled.delete(id);
      if (wasCancelled) scope.postMessage({ type: "cancelled", status: { id, state: "cancelled", progress: { completed: 0, total: 1 } } });
      else scope.postMessage({ type: "failed", status: { id, state: "failed", progress: { completed: 0, total: 1 }, error: { code: "RECONSTRUCTION_FAILED", message: error instanceof Error ? error.message : "Reconstruction worker failed.", retryable: true } } });
    }
  });
}
function isInput(value: unknown): value is ReconstructionWorkerInput { if (!value || typeof value !== "object") return false; const candidate = value as Record<string, unknown>; return Boolean(candidate.session && typeof candidate.session === "object") && (candidate.maxIterations === undefined || (typeof candidate.maxIterations === "number" && Number.isSafeInteger(candidate.maxIterations) && candidate.maxIterations > 0 && candidate.maxIterations <= 100)); }
