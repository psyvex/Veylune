import { ScheduledOptimizationController } from "./optimization-controller";
import type { ReconstructionController, ReconstructionControllerResult } from "./reconstruction-controller";

export type OptimizationPhase = "idle" | "pending" | "running" | "success" | "error";
export interface OptimizationBridgeState { readonly phase: OptimizationPhase; readonly version: number; readonly lastOptimizedVersion: number; readonly lastError?: unknown; }
export interface OptimizationBridgeOptions {
  readonly maxIterations?: number;
  readonly debounceMs?: number;
  readonly minimumIntervalMs?: number;
  readonly onResult?: (result: ReconstructionControllerResult) => void;
  readonly onError?: (error: unknown) => void;
  readonly onState?: (state: OptimizationBridgeState) => void;
}

export class ReconstructionOptimizationBridge {
  private readonly scheduler: ScheduledOptimizationController;
  private version = 0;
  private lastOptimizedVersion = 0;
  private phase: OptimizationPhase = "idle";
  private lastError: unknown;
  private readonly onState?: (state: OptimizationBridgeState) => void;

  constructor(controller: ReconstructionController, options: OptimizationBridgeOptions = {}) {
    this.onState = options.onState;
    this.scheduler = new ScheduledOptimizationController(controller, {
      ...options,
      onResult: (result) => { this.lastOptimizedVersion = this.version; this.setState("success"); options.onResult?.(result); },
      onError: (error) => { this.lastError = error; this.setState("error"); options.onError?.(error); },
    });
  }

  notifyKeyframeInserted(): number { this.version += 1; this.lastError = undefined; this.setState("pending"); this.scheduler.request(this.version); return this.version; }
  cancel(): void { this.scheduler.cancel(); if (this.phase === "pending") this.setState("idle"); }
  dispose(): void { this.scheduler.dispose(); this.setState("idle"); }
  get isRunning(): boolean { return this.scheduler.isRunning; }
  get hasPendingWork(): boolean { return this.scheduler.hasPendingWork; }
  get currentVersion(): number { return this.version; }
  get state(): OptimizationBridgeState { return { phase: this.phase, version: this.version, lastOptimizedVersion: this.lastOptimizedVersion, lastError: this.lastError }; }
  private setState(phase: OptimizationPhase): void { this.phase = phase; this.onState?.(this.state); }
}
