import { describe, expect, it } from "vitest";
import { benchmarkRecordFilename, createBenchmarkRecord } from "./benchmark-record";

describe("createBenchmarkRecord", () => {
  it("includes every reproducibility field docs/23-benchmark-contract.md requires", () => {
    const record = createBenchmarkRecord({
      benchmarkId: "bundle-adjustment-synthetic",
      benchmarkVersion: "1",
      fixtureId: "bundle-adjustment-synthetic",
      fixtureVersion: "1",
      veyluneVersion: "0.1.0",
      engineVersion: "0.1.0",
      modelIds: [],
      modelDigests: [],
      browserOrRuntime: "node-v24.21.0",
      executionBackend: "wasm",
      qualityTier: "balanced",
      summary: { samples: 10, successful: 10, p50Ms: 12, p95Ms: 20 },
      now: () => new Date("2026-09-28T12:00:00Z"),
    });
    expect(record.date).toBe("2026-09-28");
    expect(record).toMatchObject({
      benchmarkId: "bundle-adjustment-synthetic",
      benchmarkVersion: "1",
      fixtureId: "bundle-adjustment-synthetic",
      fixtureVersion: "1",
      veyluneVersion: "0.1.0",
      engineVersion: "0.1.0",
      browserOrRuntime: "node-v24.21.0",
      executionBackend: "wasm",
      qualityTier: "balanced",
    });
  });

  it("names the record file per the records/ naming convention", () => {
    const name = benchmarkRecordFilename({ benchmarkId: "bundle-adjustment-synthetic", date: "2026-09-28", engineVersion: "0.1.0" });
    expect(name).toBe("bundle-adjustment-synthetic-2026-09-28-0.1.0.json");
  });
});
