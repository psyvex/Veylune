export interface WorkerTelemetry {
  readonly queueDepth: number;
  readonly processingLatencyMs: number;
  readonly completedJobs: number;
  readonly failedJobs: number;
  readonly memoryPressure: "low" | "moderate" | "high";
}

export class WorkerTelemetryStore {
  private snapshot: WorkerTelemetry = {
    queueDepth: 0,
    processingLatencyMs: 0,
    completedJobs: 0,
    failedJobs: 0,
    memoryPressure: "low",
  };

  update(next: Partial<WorkerTelemetry>): WorkerTelemetry {
    this.snapshot = { ...this.snapshot, ...next };
    return this.snapshot;
  }

  read(): WorkerTelemetry {
    return this.snapshot;
  }
}
