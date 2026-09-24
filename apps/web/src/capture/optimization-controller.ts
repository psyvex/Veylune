import { OptimizationScheduler, type OptimizationSchedulerOptions } from "./optimization-scheduler";
import type { ReconstructionController, ReconstructionControllerProgress, ReconstructionControllerResult } from "./reconstruction-controller";

export interface ScheduledOptimizationOptions extends OptimizationSchedulerOptions { readonly maxIterations?: number; readonly onResult?: (result: ReconstructionControllerResult) => void; readonly onError?: (error: unknown) => void; readonly onProgress?: (progress: ReconstructionControllerProgress) => void; readonly onState?: (state: "pending" | "running" | "idle") => void; }
export class ScheduledOptimizationController {
  private readonly scheduler: OptimizationScheduler<number>;
  constructor(private readonly controller: ReconstructionController, private readonly options: ScheduledOptimizationOptions = {}) {
    this.scheduler = new OptimizationScheduler(async ({ input }) => {
      options.onState?.("running");
      try { const result = await this.controller.optimize(options.maxIterations ?? 5); options.onResult?.(result); }
      catch (error) { options.onError?.(error); }
      finally { options.onState?.("idle"); if (input < 0) return; }
    }, options);
  }
  request(version: number): void { this.options.onState?.("pending"); this.scheduler.request({ version, input: version }); }
  cancel(): void { this.scheduler.cancel(); this.options.onState?.("idle"); }
  dispose(): void { this.scheduler.dispose(); this.options.onState?.("idle"); }
  get isRunning(): boolean { return this.scheduler.isRunning; }
  get hasPendingWork(): boolean { return this.scheduler.hasPendingWork; }
}
