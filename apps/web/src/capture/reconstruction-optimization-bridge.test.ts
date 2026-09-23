import { describe, expect, it, vi } from "vitest";
import { ReconstructionOptimizationBridge } from "./reconstruction-optimization-bridge";

describe("ReconstructionOptimizationBridge", () => {
  it("turns keyframe insertions into monotonically increasing optimization versions", () => {
    const controller = { optimize: vi.fn().mockResolvedValue({ committed: true }) } as never;
    const bridge = new ReconstructionOptimizationBridge(controller, { debounceMs: 10, minimumIntervalMs: 0 });
    expect(bridge.notifyKeyframeInserted()).toBe(1);
    expect(bridge.notifyKeyframeInserted()).toBe(2);
    expect(bridge.currentVersion).toBe(2);
    bridge.dispose();
  });

  it("cancels queued optimization work", async () => {
    vi.useFakeTimers();
    const optimize = vi.fn().mockResolvedValue({ committed: true });
    const bridge = new ReconstructionOptimizationBridge({ optimize } as never, { debounceMs: 50, minimumIntervalMs: 0 });
    bridge.notifyKeyframeInserted();
    bridge.cancel();
    await vi.advanceTimersByTimeAsync(100);
    expect(optimize).not.toHaveBeenCalled();
    bridge.dispose();
    vi.useRealTimers();
  });
});
