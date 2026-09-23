import type { JobTransport } from "../runtime/job";
import { ReconstructionStateStore } from "./reconstruction-state";
import type { ReconstructionSessionSnapshot } from "./reconstruction-session";
import type { ReconstructionWorkerInput, ReconstructionWorkerOutput } from "./reconstruction-worker";

export type ReconstructionControllerState = "idle" | "running" | "cancelling";
export interface ReconstructionControllerResult { readonly committed: boolean; readonly stale: boolean; readonly jobId: string; readonly output?: ReconstructionWorkerOutput; readonly reason?: string; }

export class ReconstructionController {
  private stateValue: ReconstructionControllerState = "idle";
  private activeId?: string;
  private unsubscribe: (() => void) | undefined;
  constructor(private readonly store: ReconstructionStateStore, private readonly transport: JobTransport<ReconstructionWorkerInput, ReconstructionWorkerOutput>) {}
  get state(): ReconstructionControllerState { return this.stateValue; }
  async optimize(maxIterations = 5): Promise<ReconstructionControllerResult> {
    if (this.activeId) throw new Error("A reconstruction job is already running.");
    const snapshot = this.store.snapshot();
    const expectedMapVersion = snapshot.map.version;
    const expectedPoseVersion = snapshot.poses.version;
    const jobId = `${expectedMapVersion}:${expectedPoseVersion}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
    this.activeId = jobId; this.stateValue = "running";
    try {
      const outputPromise = new Promise<ReconstructionWorkerOutput>((resolve, reject) => {
        this.unsubscribe = this.transport.subscribe((event) => {
          if (event.status.id !== jobId) return;
          if (event.type === "completed") resolve(event.output);
          else if (event.type === "failed") reject(new Error(event.status.error?.message ?? "Reconstruction worker failed."));
        });
      });
      await this.transport.submit({ id: jobId, operation: "reconstruct", input: { session: snapshot, maxIterations } });
      const output = await outputPromise;
      const committed = this.store.commit({ expectedMapVersion, expectedPoseVersion, snapshot: output.candidate });
      return { committed, stale: !committed, jobId, output, reason: committed ? undefined : "state-changed" };
    } finally { this.unsubscribe?.(); this.unsubscribe = undefined; this.activeId = undefined; this.stateValue = "idle"; }
  }
  async cancel(): Promise<void> { if (!this.activeId) return; this.stateValue = "cancelling"; await this.transport.cancel(this.activeId); }
  dispose(): void { this.unsubscribe?.(); this.unsubscribe = undefined; this.activeId = undefined; this.stateValue = "idle"; }
}

export function createReconstructionController(initial: ReconstructionSessionSnapshot, transport: JobTransport<ReconstructionWorkerInput, ReconstructionWorkerOutput>): ReconstructionController { return new ReconstructionController(new ReconstructionStateStore(initial), transport); }
