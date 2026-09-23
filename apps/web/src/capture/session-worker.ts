import { validateReconstructionSession, type ReconstructionSessionSnapshot } from "./reconstruction-session";
import { optimizeAndCommitReconstruction } from "./reconstruction-optimizer";
import type { ReconstructionStateStore } from "./reconstruction-state";

export interface ReconstructionJob { readonly id: string; readonly session: ReconstructionSessionSnapshot; readonly maxIterations?: number; readonly signal?: AbortSignal; }
export interface ReconstructionJobResult { readonly id: string; readonly committed: boolean; readonly iterations: number; readonly initialCost: number; readonly finalCost: number; readonly reason?: string; }

export async function runReconstructionJob(store: ReconstructionStateStore, job: ReconstructionJob): Promise<ReconstructionJobResult> {
  if (!job.id || !validateReconstructionSession(job.session)) throw new Error("Invalid reconstruction job.");
  if (job.signal?.aborted) return { id: job.id, committed: false, iterations: 0, initialCost: 0, finalCost: 0, reason: "cancelled" };
  const result = optimizeAndCommitReconstruction(store, job.session, job.maxIterations ?? 5);
  if (job.signal?.aborted) return { id: job.id, committed: false, iterations: result.iterations, initialCost: result.initialCost, finalCost: result.finalCost, reason: "cancelled" };
  return { id: job.id, committed: result.committed, iterations: result.iterations, initialCost: result.initialCost, finalCost: result.finalCost, reason: result.reason };
}

export function serializeJob(job: ReconstructionJob): string { return JSON.stringify({ id: job.id, session: job.session, maxIterations: job.maxIterations }); }
export function deserializeJob(value: string): ReconstructionJob { const parsed: unknown = JSON.parse(value); if (!parsed || typeof parsed !== "object" || !("id" in parsed) || !("session" in parsed) || typeof parsed.id !== "string") throw new Error("Invalid serialized reconstruction job."); return createReconstructionJob(parsed.id, parsed.session, "maxIterations" in parsed && typeof parsed.maxIterations === "number" ? parsed.maxIterations : undefined); }
function createReconstructionJob(id: string, session: unknown, maxIterations?: number): ReconstructionJob { if (!id || !validateReconstructionSession(session as ReconstructionSessionSnapshot)) throw new Error("Invalid reconstruction job."); return { id, session: session as ReconstructionSessionSnapshot, maxIterations }; }
