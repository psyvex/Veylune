export interface CaptureLoad {
  readonly queueDepth: number;
  readonly memoryPressure: "low" | "moderate" | "high";
  readonly processingLatencyMs: number;
}

export interface CapturePolicy {
  readonly frameRate: number;
  readonly maxResolution: number;
}

export function adaptCapturePolicy(load: CaptureLoad): CapturePolicy {
  if (load.memoryPressure === "high" || load.queueDepth >= 8 || load.processingLatencyMs >= 500) {
    return { frameRate: 4, maxResolution: 1280 };
  }
  if (load.memoryPressure === "moderate" || load.queueDepth >= 4 || load.processingLatencyMs >= 250) {
    return { frameRate: 8, maxResolution: 1920 };
  }
  return { frameRate: 12, maxResolution: 2560 };
}
