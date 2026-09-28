import { describe, expect, it } from "vitest";
import { executeReconstructionWorker, installReconstructionWorker, type ReconstructionWorkerInput, type ReconstructionWorkerOutput } from "./reconstruction-worker";
import { WorkerJobTransport } from "../runtime/worker-transport";
import { createReconstructionController } from "./reconstruction-controller";
import { identityCameraPose } from "./keyframe-pose";

function session() {
  const points = [{ id: "l1", x: -1, y: -1, z: 4 }, { id: "l2", x: 1, y: -1, z: 4 }, { id: "l3", x: -1, y: 1, z: 5 }, { id: "l4", x: 1, y: 1, z: 5 }];
  const first = identityCameraPose(); const second = { ...identityCameraPose(), translation: [0.1, 0, 0] as const };
  // pose.translation is the camera's world-space CENTER (see
  // reprojection.ts's projectPoint), so k2's pixel is projected through
  // R*(point - center) — point.x MINUS the camera's 0.1 center offset, not
  // plus. This fixture must land exactly on that model for "already
  // optimal, zero residual" to actually hold.
  const observations = points.flatMap((point) => [
    { id: `${point.id}-a`, keyframeId: "k1", landmarkId: point.id, x: 100 * point.x / point.z + 50, y: 100 * point.y / point.z + 50 },
    { id: `${point.id}-b`, keyframeId: "k2", landmarkId: point.id, x: 100 * (point.x - 0.1) / point.z + 50, y: 100 * point.y / point.z + 50 },
  ]);
  return { schemaVersion: 3 as const, createdAtMs: 1, calibration: { intrinsics: { fx: 100, fy: 100, cx: 50, cy: 50 }, distortion: { k1: 0, k2: 0, k3: 0, p1: 0, p2: 0 } }, map: { version: 0, landmarks: points.map((point) => ({ ...point, observations: 2, lastSeenFrame: 1 })), keyframes: [{ id: "k1", frameIndex: 0, timestampMs: 1, landmarkIds: points.map((point) => point.id) }, { id: "k2", frameIndex: 1, timestampMs: 2, landmarkIds: points.map((point) => point.id) }] }, poses: { version: 0, poses: [{ id: "k1", frameIndex: 0, timestampMs: 1, pose: first, fixed: true }, { id: "k2", frameIndex: 1, timestampMs: 2, pose: second, fixed: false }] }, observations };
}

/** Shared emitter wired so transport posts and worker handler hear each other. */
class LoopbackWorker {
  private readonly listeners = new Set<(event: { data: unknown }) => void>();
  addEventListener(type: string, listener: (event: never) => void): void { if (type === "message") this.listeners.add(listener as unknown as (event: { data: unknown }) => void); }
  removeEventListener(type: string, listener: (event: never) => void): void { if (type === "message") this.listeners.delete(listener as unknown as (event: { data: unknown }) => void); }
  postMessage(message: unknown): void { queueMicrotask(() => { for (const listener of [...this.listeners]) listener({ data: message }); }); }
  terminate(): void { this.listeners.clear(); }
}

function loopbackController(initial: ReturnType<typeof session>) {
  const worker = new LoopbackWorker();
  installReconstructionWorker(worker as unknown as Parameters<typeof installReconstructionWorker>[0]);
  const transport = new WorkerJobTransport<ReconstructionWorkerInput, ReconstructionWorkerOutput>(worker as unknown as ConstructorParameters<typeof WorkerJobTransport>[0]);
  return createReconstructionController(initial, transport);
}

function noisySession() {
  // Same geometry as session(), but the second view is shifted 0.3 px — the
  // map is no longer optimal, so a full transport round trip must COMPLETE
  // (the optimal fixture can only prove the worker answers at all).
  const base = session();
  return { ...base, observations: base.observations.map((o) => (o.keyframeId === "k2" ? { ...o, x: o.x + 0.3 } : o)) };
}

describe("reconstruction worker", () => {
  it("rejects a valid but already optimal map instead of committing a no-op candidate", () => { const input = session(); expect(() => executeReconstructionWorker({ session: input, maxIterations: 2 })).toThrow("Optimization did not produce an improving solution."); });
  it("enforces a bounded iteration budget", () => { expect(() => executeReconstructionWorker({ session: session(), maxIterations: 101 })).toThrow(); });
  it("parses the submit envelope posted by WorkerJobTransport and answers", async () => {
    // Regression: the transport wraps jobs as { type:"submit", request:{...} }
    // while the handler once read id/input off the top level — every live
    // refinement job was dropped and optimize() hung at "0 of 0 iterations".
    // This fixture is already optimal, so a rejection proves the job was
    // parsed AND answered; before the fix this awaited forever.
    await expect(loopbackController(session()).optimize(2)).rejects.toThrow("Optimization did not produce an improving solution.");
  });
  it("completes an improving refinement through the transport and commits it", async () => {
    const controller = loopbackController(noisySession());
    const result = await controller.optimize(5);
    expect(result.committed).toBe(true);
    expect(result.output?.iterations).toBeGreaterThanOrEqual(1);
    expect(result.output?.finalCost).toBeLessThan(result.output?.initialCost ?? Number.POSITIVE_INFINITY);
  });
});
