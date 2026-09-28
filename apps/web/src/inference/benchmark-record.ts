import type { BenchmarkSummary } from "./benchmark";
import type { InferenceBackend } from "./model";

/**
 * The reproducibility fields `docs/23-benchmark-contract.md` requires on
 * every stored benchmark record. This module only formats a record and
 * names where it would live — it does not write to disk automatically
 * (nothing here runs a real model benchmark yet; see `benchmarks/README.md`).
 * Once a real benchmark run exists, its caller writes the JSON this
 * produces to `benchmarks/records/<benchmarkId>-<date>-<engineVersion>.json`.
 */
export interface BenchmarkRecord {
  readonly benchmarkId: string;
  readonly benchmarkVersion: string;
  readonly fixtureId: string;
  readonly fixtureVersion: string;
  readonly veyluneVersion: string;
  readonly engineVersion: string;
  readonly modelIds: readonly string[];
  readonly modelDigests: readonly string[];
  readonly browserOrRuntime: string;
  readonly executionBackend: InferenceBackend | "native";
  readonly qualityTier: "preview" | "balanced" | "high" | "maximum";
  readonly date: string;
  readonly summary: BenchmarkSummary;
}

export interface BenchmarkRecordInput {
  readonly benchmarkId: string;
  readonly benchmarkVersion: string;
  readonly fixtureId: string;
  readonly fixtureVersion: string;
  readonly veyluneVersion: string;
  readonly engineVersion: string;
  readonly modelIds: readonly string[];
  readonly modelDigests: readonly string[];
  readonly browserOrRuntime: string;
  readonly executionBackend: InferenceBackend | "native";
  readonly qualityTier: "preview" | "balanced" | "high" | "maximum";
  readonly summary: BenchmarkSummary;
  /** Injectable for tests; defaults to the current time. */
  readonly now?: () => Date;
}

/** The exact filename a record with these fields would be stored under. */
export function benchmarkRecordFilename(record: Pick<BenchmarkRecord, "benchmarkId" | "date" | "engineVersion">): string {
  return `${record.benchmarkId}-${record.date}-${record.engineVersion}.json`;
}

export function createBenchmarkRecord(input: BenchmarkRecordInput): BenchmarkRecord {
  const date = (input.now?.() ?? new Date()).toISOString().slice(0, 10);
  return {
    benchmarkId: input.benchmarkId,
    benchmarkVersion: input.benchmarkVersion,
    fixtureId: input.fixtureId,
    fixtureVersion: input.fixtureVersion,
    veyluneVersion: input.veyluneVersion,
    engineVersion: input.engineVersion,
    modelIds: input.modelIds,
    modelDigests: input.modelDigests,
    browserOrRuntime: input.browserOrRuntime,
    executionBackend: input.executionBackend,
    qualityTier: input.qualityTier,
    date,
    summary: input.summary,
  };
}
