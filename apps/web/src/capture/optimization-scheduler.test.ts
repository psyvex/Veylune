import { describe, expect, it, vi } from "vitest";
import { OptimizationScheduler } from "./optimization-scheduler";

describe("OptimizationScheduler", () => {
  it("coalesces bursts into the newest reconstruction request", async () => {
    vi.useFakeTimers();
    const runs: number[] = [];
    const scheduler = new OptimizationScheduler(async ({ version }) => { runs.push(version); }, { debounceMs: 100, minimumIntervalMs: 0 });
    scheduler.request({ version: 1, input: "first" });
    scheduler.request({ version: 2, input: "latest" });
    await vi.advanceTimersByTimeAsync(99);
    expect(runs).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(runs).toEqual([2]);
    scheduler.dispose();
    vi.useRealTimers();
  });

  it("runs pending work after an in-flight optimization completes", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const runs: number[] = [];
    const scheduler = new OptimizationScheduler(async ({ version }) => { runs.push(version); if (version === 1) await gate; }, { debounceMs: 0, minimumIntervalMs: 0 });
    scheduler.request({ version: 1, input: null });
    await new Promise((resolve) => setTimeout(resolve, 0));
    scheduler.request({ version: 2, input: null });
    expect(scheduler.hasPendingWork).toBe(true);
    release();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(runs).toEqual([1, 2]);
    scheduler.dispose();
  });

  it("rejects invalid versions", () => {
    const scheduler = new OptimizationScheduler(async () => undefined);
    expect(() => scheduler.request({ version: -1, input: null })).toThrow();
    scheduler.dispose();
  });
});
