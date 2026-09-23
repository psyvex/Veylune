export interface ScanSchedulerOptions {
  readonly maxFramesPerSecond: number;
  readonly minIntervalMs: number;
}

export class ScanScheduler {
  private lastCaptureAt = -Infinity;

  constructor(private readonly options: ScanSchedulerOptions) {}

  shouldCapture(now = performance.now()): boolean {
    const interval = Math.max(this.options.minIntervalMs, 1000 / this.options.maxFramesPerSecond);
    if (now - this.lastCaptureAt < interval) return false;
    this.lastCaptureAt = now;
    return true;
  }
}
