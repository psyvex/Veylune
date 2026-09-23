import { describe, expect, it } from "vitest";
import { ScheduledOptimizationController } from "./optimization-controller";
import type { ReconstructionController, ReconstructionControllerResult } from "./reconstruction-controller";

class FakeController { calls = 0; async optimize(): Promise<ReconstructionControllerResult> { this.calls++; return { committed: true, stale: false, jobId: `job-${this.calls}` }; } }

describe("ScheduledOptimizationController", () => {
  it("coalesces requests before invoking reconstruction", async () => {
    const controller = new FakeController();
    const scheduled = new ScheduledOptimizationController(controller as unknown as ReconstructionController, { debounceMs: 10, minimumIntervalMs: 0 });
    scheduled.request(1);
    scheduled.request(2);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(controller.calls).toBe(1);
    scheduled.dispose();
  });

  it("surfaces worker errors without breaking the scheduler", async () => {
    const errors: unknown[] = [];
    const controller = { optimize: async () => { throw new Error("worker failed"); } } as unknown as ReconstructionController;
    const scheduled = new ScheduledOptimizationController(controller, { debounceMs: 0, minimumIntervalMs: 0, onError: (error) => errors.push(error) });
    scheduled.request(1);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(errors).toHaveLength(1);
    expect(scheduled.isRunning).toBe(false);
    scheduled.dispose();
  });
});
