import { describe, expect, it } from "vitest";
import { ReconstructionController } from "./reconstruction-controller";
import type { ReconstructionWorkerInput, ReconstructionWorkerOutput } from "./reconstruction-worker";
import type { JobEvent, JobRequest, JobStatus, JobTransport } from "../runtime/job";
import { identityCameraPose } from "./keyframe-pose";

class ImmediateTransport implements JobTransport<ReconstructionWorkerInput, ReconstructionWorkerOutput> {
  private listener: ((event: JobEvent<ReconstructionWorkerOutput>) => void) | undefined;
  cancelled = false;
  subscribe(listener: (event: JobEvent<ReconstructionWorkerOutput>) => void): () => void { this.listener = listener; return () => { this.listener = undefined; }; }
  async submit(request: JobRequest<ReconstructionWorkerInput>): Promise<void> { const source = request.input.session; const candidate = { ...source, map: { ...source.map, version: source.map.version + 1 }, poses: { ...source.poses, version: source.poses.version + 1 }, createdAtMs: source.createdAtMs + 1 }; const output = { candidate, iterations: 1, initialCost: 2, finalCost: 1 }; this.listener?.({ type: "completed", status: { id: request.id, state: "completed", progress: { completed: 1, total: 1 } }, output }); }
  async cancel(): Promise<void> { this.cancelled = true; }
}
function session() { return { schemaVersion: 3 as const, createdAtMs: 1, calibration: { intrinsics: { fx: 100, fy: 100, cx: 0, cy: 0 }, distortion: { k1: 0, k2: 0, k3: 0, p1: 0, p2: 0 } }, map: { version: 0, landmarks: [{ id: "l1", x: 0, y: 0, z: 2, observations: 1, lastSeenFrame: 0 }], keyframes: [{ id: "k1", frameIndex: 0, timestampMs: 1, landmarkIds: ["l1"] }] }, poses: { version: 0, poses: [{ id: "k1", frameIndex: 0, timestampMs: 1, pose: identityCameraPose(), fixed: true }] }, observations: [{ id: "o1", keyframeId: "k1", landmarkId: "l1", x: 0, y: 0 }] }; }

describe("ReconstructionController", () => {
  it("commits a worker candidate atomically", async () => { const transport = new ImmediateTransport(); const controller = new ReconstructionController(new (await import("./reconstruction-state")).ReconstructionStateStore(session()), transport); const result = await controller.optimize(); expect(result.committed).toBe(true); expect(result.stale).toBe(false); expect(controller.state).toBe("idle"); });
  it("rejects a second active job", async () => { const transport = new ImmediateTransport(); const controller = new ReconstructionController(new (await import("./reconstruction-state")).ReconstructionStateStore(session()), transport); const first = controller.optimize(); await expect(controller.optimize()).rejects.toThrow(); await first; });
});
