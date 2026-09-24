import { describe, expect, it, vi } from "vitest";
import type { JobRequest } from "../runtime/job";
import { WorkerJobTransport } from "../runtime/worker-transport";
import { identityCameraPose } from "./keyframe-pose";
import { ReconstructionOptimizationBridge } from "./reconstruction-optimization-bridge";
import { ReconstructionController } from "./reconstruction-controller";
import { ReconstructionStateStore } from "./reconstruction-state";
import type { ReconstructionWorkerInput, ReconstructionWorkerOutput } from "./reconstruction-worker";

class FakeWorker {
  private readonly listeners = new Map<string, Set<(event: never) => void>>();
  private completion?: unknown;
  terminated = false;
  constructor(private readonly autoComplete = true) {}
  addEventListener(type: string, listener: (event: never) => void): void { const set = this.listeners.get(type) ?? new Set(); set.add(listener); this.listeners.set(type, set); }
  removeEventListener(type: string, listener: (event: never) => void): void { this.listeners.get(type)?.delete(listener); }
  postMessage(message: unknown): void {
    const data = message as { type: string; request?: JobRequest<ReconstructionWorkerInput>; id?: string };
    if (data.type === "submit" && data.request) {
      const { id, input } = data.request;
      this.emit("message", { data: { type: "progress", status: { id, state: "running", progress: { completed: 1, total: 2, cost: 3, initialCost: 5, improvement: 0.4 } } } });
      this.completion = (() => {
        const source = input.session;
        const output: ReconstructionWorkerOutput = { candidate: { ...source, createdAtMs: source.createdAtMs + 1, map: { ...source.map, version: source.map.version + 1 }, poses: { ...source.poses, version: source.poses.version + 1 } }, iterations: 2, initialCost: 5, finalCost: 3 };
        return { data: { type: "completed", status: { id, state: "completed", progress: { completed: 2, total: 2, cost: 3, initialCost: 5, improvement: 0.4 } }, output } };
      })();
      if (this.autoComplete) queueMicrotask(() => this.finish());
    }
    if (data.type === "cancel" && data.id) this.emit("message", { data: { type: "cancelled", status: { id: data.id, state: "cancelled", progress: { completed: 0, total: 0 } } } });
  }
  terminate(): void { this.terminated = true; }
  finish(): void { if (this.completion) { this.emit("message", this.completion); this.completion = undefined; } }
  private emit(type: string, event: unknown): void { for (const listener of this.listeners.get(type) ?? []) listener(event as never); }
}

function makeSession() {
  return { schemaVersion: 3 as const, createdAtMs: 1, calibration: { intrinsics: { fx: 100, fy: 100, cx: 0, cy: 0 }, distortion: { k1: 0, k2: 0, k3: 0, p1: 0, p2: 0 } }, map: { version: 0, landmarks: [{ id: "l1", x: 0, y: 0, z: 2, observations: 1, lastSeenFrame: 0 }], keyframes: [{ id: "k1", frameIndex: 0, timestampMs: 1, landmarkIds: ["l1"] }] }, poses: { version: 0, poses: [{ id: "k1", frameIndex: 0, timestampMs: 1, pose: identityCameraPose(), fixed: true }] }, observations: [{ id: "o1", keyframeId: "k1", landmarkId: "l1", x: 0, y: 0 }] };
}

describe("optimization integration", () => {
  it("forwards worker cost progress through transport, controller, and bridge before committing", async () => {
    vi.useFakeTimers();
    const worker = new FakeWorker(); const store = new ReconstructionStateStore(makeSession());
    const controller = new ReconstructionController(store, new WorkerJobTransport<ReconstructionWorkerInput, ReconstructionWorkerOutput>(worker));
    const phases: string[] = [];
    const bridge = new ReconstructionOptimizationBridge(controller, { debounceMs: 0, minimumIntervalMs: 0, onState: (state) => phases.push(`${state.phase}:${state.iteration}:${state.cost ?? "-"}`) });
    bridge.notifyKeyframeInserted();
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();
    expect(phases).toContain("running:1:3");
    expect(bridge.state.phase).toBe("success");
    expect(bridge.state.initialCost).toBe(5);
    expect(store.snapshot().map.version).toBe(1);
    bridge.dispose(); vi.useRealTimers();
  });

  it("rejects a stale worker candidate without replacing newer reconstruction state", async () => {
    vi.useFakeTimers();
    const worker = new FakeWorker(false); const initial = makeSession(); const store = new ReconstructionStateStore(initial);
    const controller = new ReconstructionController(store, new WorkerJobTransport<ReconstructionWorkerInput, ReconstructionWorkerOutput>(worker));
    const bridge = new ReconstructionOptimizationBridge(controller, { debounceMs: 0, minimumIntervalMs: 0 });
    bridge.notifyKeyframeInserted();
    await vi.advanceTimersByTimeAsync(0);
    const intervening = { ...initial, createdAtMs: 2, map: { ...initial.map, version: 1 }, poses: { ...initial.poses, version: 1 } };
    expect(store.commit({ expectedMapVersion: 0, expectedPoseVersion: 0, snapshot: intervening })).toBe(true);
    worker.finish();
    await Promise.resolve();
    await Promise.resolve();
    expect(bridge.state.phase).toBe("stale");
    expect(store.snapshot().createdAtMs).toBe(2);
    bridge.dispose(); vi.useRealTimers();
  });

  it("cancels active work from the bridge and returns to idle", async () => {
    vi.useFakeTimers();
    const worker = new FakeWorker(false); const store = new ReconstructionStateStore(makeSession());
    const controller = new ReconstructionController(store, new WorkerJobTransport<ReconstructionWorkerInput, ReconstructionWorkerOutput>(worker));
    const bridge = new ReconstructionOptimizationBridge(controller, { debounceMs: 0, minimumIntervalMs: 0 });
    bridge.notifyKeyframeInserted();
    await vi.advanceTimersByTimeAsync(0);
    await bridge.cancel();
    expect(bridge.state.phase).toBe("idle");
    expect(worker.terminated).toBe(false);
    bridge.dispose(); vi.useRealTimers();
  });

  it("cleans up worker listeners and resources across repeated worker lifecycles", () => {
    const workers = [new FakeWorker(), new FakeWorker(), new FakeWorker()];
    for (const worker of workers) { const transport = new WorkerJobTransport<void, void>(worker); transport.dispose(); }
    expect(workers.every((worker) => worker.terminated)).toBe(true);
  });
});
