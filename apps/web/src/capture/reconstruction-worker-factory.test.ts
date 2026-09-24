import { describe, expect, it, vi } from "vitest";
import { createBrowserReconstructionWorker } from "./reconstruction-worker-factory";
import { identityCameraPose } from "./keyframe-pose";

function session() {
  return { schemaVersion: 3 as const, createdAtMs: 1, calibration: { intrinsics: { fx: 100, fy: 100, cx: 0, cy: 0 }, distortion: { k1: 0, k2: 0, k3: 0, p1: 0, p2: 0 } }, map: { version: 0, landmarks: [], keyframes: [{ id: "k1", frameIndex: 0, timestampMs: 1, landmarkIds: [] }] }, poses: { version: 0, poses: [{ id: "k1", frameIndex: 0, timestampMs: 1, pose: identityCameraPose(), fixed: true }] }, observations: [] };
}

class LifecycleWorker {
  terminated = false;
  readonly listeners = new Map<string, Set<unknown>>();
  addEventListener(type: string, listener: unknown): void { const items = this.listeners.get(type) ?? new Set(); items.add(listener); this.listeners.set(type, items); }
  removeEventListener(type: string, listener: unknown): void { this.listeners.get(type)?.delete(listener); }
  postMessage(): void {}
  terminate(): void { this.terminated = true; }
}

describe("browser reconstruction worker factory lifecycle", () => {
  it("releases worker listeners and terminates workers across repeated start/stop cycles", () => {
    const workers: LifecycleWorker[] = [];
    vi.stubGlobal("Worker", class extends LifecycleWorker { constructor() { super(); workers.push(this); } });
    for (let index = 0; index < 3; index++) {
      const factory = createBrowserReconstructionWorker();
      factory.create(session());
      factory.dispose();
    }
    expect(workers).toHaveLength(3);
    for (const worker of workers) {
      expect(worker.terminated).toBe(true);
      expect([...worker.listeners.values()].every((listeners) => listeners.size === 0)).toBe(true);
    }
    vi.unstubAllGlobals();
  });
});
