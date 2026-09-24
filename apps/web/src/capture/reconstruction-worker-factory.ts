import { WorkerJobTransport } from "../runtime/worker-transport";
import { createReconstructionController, type ReconstructionController } from "./reconstruction-controller";
import type { ReconstructionSessionSnapshot } from "./reconstruction-session";
import type { ReconstructionWorkerInput, ReconstructionWorkerOutput } from "./reconstruction-worker";

export interface ReconstructionWorkerFactory { create(initial: ReconstructionSessionSnapshot): ReconstructionController; dispose(): void; }

export function createBrowserReconstructionWorker(): ReconstructionWorkerFactory {
  const workers = new Set<Worker>();
  return {
    create(initial) {
      const worker = new Worker(new URL("./reconstruction-worker-entry.ts", import.meta.url), { type: "module" });
      workers.add(worker);
      const transport = new WorkerJobTransport<ReconstructionWorkerInput, ReconstructionWorkerOutput>(worker);
      return createReconstructionController(initial, transport);
    },
    dispose() {
      for (const worker of workers) worker.terminate();
      workers.clear();
    },
  };
}
