import { ScheduledOptimizationController } from "./optimization-controller";
import type { ReconstructionController } from "./reconstruction-controller";

export interface OptimizationBridgeOptions {
  readonly maxIterations?: number;
  readonly debounceMs?: number;
  readonly minimumIntervalMs?: number;
  readonly onResult?: (result: unknown) => void;
  readonly onError?: (error: unknown) => void;
}

/** Bridges accepted keyframes to debounced background bundle adjustment. */
export class ReconstructionOptimizationBridge {
  private readonly scheduler: ScheduledOptimizationController;
  private version = 0;

  constructor(controller: ReconstructionController, options: OptimizationBridgeOptions = {}) {
    this.scheduler = new ScheduledOptimizationController(controller, options);
  }

  notifyKeyframeInserted(): number {
    this.version += 1;
    this.scheduler.request(this.version);
    return this.version;
  }

  cancel(): void { this.scheduler.cancel(); }
  dispose(): void { this.scheduler.dispose(); }
  get isRunning(): boolean { return this.scheduler.isRunning; }
  get hasPendingWork(): boolean { return this.scheduler.hasPendingWork; }
  get currentVersion(): number { return this.version; }
}
