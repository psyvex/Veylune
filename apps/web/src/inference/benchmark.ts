import type { InferenceBackend } from "./model";

export interface BenchmarkSample {
  readonly backend: InferenceBackend;
  readonly modelId: string;
  readonly deviceClass: string;
  readonly durationMs: number;
  readonly success: boolean;
}

export interface BenchmarkSummary {
  readonly samples: number;
  readonly successful: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
}

export function summarizeBenchmarks(samples: readonly BenchmarkSample[]): BenchmarkSummary {
  const durations = samples.filter((sample) => sample.success).map((sample) => sample.durationMs).sort((a, b) => a - b);
  const percentile = (ratio: number): number => {
    if (durations.length === 0) return Number.POSITIVE_INFINITY;
    return durations[Math.min(durations.length - 1, Math.floor((durations.length - 1) * ratio))]!;
  };
  return {
    samples: samples.length,
    successful: durations.length,
    p50Ms: percentile(0.5),
    p95Ms: percentile(0.95),
  };
}
