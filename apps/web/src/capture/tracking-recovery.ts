export type TrackingState = "initializing" | "tracking" | "recovering" | "lost";
export interface TrackingRecoveryOptions { readonly recoverAfter?: number; readonly loseAfter?: number; }
export interface TrackingUpdate { readonly accepted: boolean; readonly confidence: number; readonly inliers: number; }

export class TrackingRecovery {
  private readonly recoverAfter: number; private readonly loseAfter: number; private state: TrackingState = "initializing"; private consecutiveAccepted = 0; private consecutiveRejected = 0;
  constructor(options: TrackingRecoveryOptions = {}) { this.recoverAfter = Math.max(1, options.recoverAfter ?? 2); this.loseAfter = Math.max(1, options.loseAfter ?? 3); }
  update(result: TrackingUpdate): TrackingState {
    if (result.accepted) { this.consecutiveAccepted++; this.consecutiveRejected = 0; if (this.state === "lost" || this.state === "recovering") { if (this.consecutiveAccepted >= this.recoverAfter) this.state = "tracking"; } else { this.state = "tracking"; } }
    else { this.consecutiveRejected++; this.consecutiveAccepted = 0; if (this.state === "tracking" && this.consecutiveRejected >= this.loseAfter) this.state = "lost"; else if (this.state === "tracking") this.state = "recovering"; }
    return this.state;
  }
  get current(): TrackingState { return this.state; }
  reset(): void { this.state = "initializing"; this.consecutiveAccepted = 0; this.consecutiveRejected = 0; }
}
