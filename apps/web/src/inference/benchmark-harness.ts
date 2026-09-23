import type { InferenceBackend } from "./model";
import type { InferenceRuntimeAdapter } from "./runtime";
import type { BenchmarkSample } from "./benchmark";

export interface BenchmarkHarnessInput<TInput, TOutput> {
  readonly runtime: InferenceRuntimeAdapter<TInput, TOutput>;
  readonly backend: InferenceBackend;
  readonly modelId: string;
  readonly deviceClass: string;
  readonly input: TInput;
  readonly runs: number;
  readonly execute: (runtime: InferenceRuntimeAdapter<TInput, TOutput>, input: TInput) => Promise<unknown>;
}

export async function runBenchmark<TInput, TOutput>(
  options: BenchmarkHarnessInput<TInput, TOutput>,
): Promise<readonly BenchmarkSample[]> {
  const samples: BenchmarkSample[] = [];
  for (let index = 0; index < options.runs; index += 1) {
    const started = performance.now();
    try {
      await options.execute(options.runtime, options.input);
      samples.push({
        backend: options.backend,
        modelId: options.modelId,
        deviceClass: options.deviceClass,
        durationMs: performance.now() - started,
        success: true,
      });
    } catch {
      samples.push({
        backend: options.backend,
        modelId: options.modelId,
        deviceClass: options.deviceClass,
        durationMs: performance.now() - started,
        success: false,
      });
    }
  }
  return samples;
}
