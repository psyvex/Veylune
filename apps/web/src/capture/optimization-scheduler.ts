export interface OptimizationRequest<T> { readonly version: number; readonly input: T; }
export interface OptimizationSchedulerOptions { readonly debounceMs?: number; readonly minimumIntervalMs?: number; readonly now?: () => number; }
export type OptimizationRunner<T> = (request: OptimizationRequest<T>) => Promise<void>;

export class OptimizationScheduler<T> {
  private readonly debounceMs: number;
  private readonly minimumIntervalMs: number;
  private readonly now: () => number;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private running = false;
  private pending: OptimizationRequest<T> | undefined;
  private lastStartedAt = Number.NEGATIVE_INFINITY;
  private disposed = false;

  constructor(private readonly run: OptimizationRunner<T>, options: OptimizationSchedulerOptions = {}) {
    this.debounceMs = Math.max(0, options.debounceMs ?? 250);
    this.minimumIntervalMs = Math.max(0, options.minimumIntervalMs ?? 500);
    this.now = options.now ?? (() => Date.now());
  }

  request(request: OptimizationRequest<T>): void {
    if (this.disposed) return;
    if (!Number.isInteger(request.version) || request.version < 0) throw new Error("Optimization version must be a non-negative integer.");
    this.pending = request;
    this.arm();
  }

  cancel(): void {
    this.pending = undefined;
    if (this.timer !== undefined) { clearTimeout(this.timer); this.timer = undefined; }
  }

  dispose(): void { this.disposed = true; this.cancel(); }
  get isRunning(): boolean { return this.running; }
  get hasPendingWork(): boolean { return this.pending !== undefined; }

  private arm(): void {
    if (this.running || this.timer !== undefined || this.disposed) return;
    const wait = Math.max(this.debounceMs, this.minimumIntervalMs - (this.now() - this.lastStartedAt), 0);
    this.timer = setTimeout(() => { this.timer = undefined; void this.flush(); }, wait);
  }

  private async flush(): Promise<void> {
    if (this.running || this.disposed || !this.pending) return;
    const request = this.pending;
    this.pending = undefined;
    this.running = true;
    this.lastStartedAt = this.now();
    try { await this.run(request); }
    finally {
      this.running = false;
      if (!this.disposed && this.pending) this.arm();
    }
  }
}
