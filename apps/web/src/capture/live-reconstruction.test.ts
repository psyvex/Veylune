import { describe, expect, it, vi } from "vitest";
import { identityCameraPose } from "./keyframe-pose";
import { LiveReconstructionProcessor } from "./live-reconstruction";
import type { FeatureSet } from "./features";
import type { ScanFrame } from "./live-scan";

const featureSet: FeatureSet = { keypoints: Array.from({ length: 8 }, (_, index) => ({ x: index * 3, y: index * 2, score: 1 })), descriptors: [] };
const frame: ScanFrame = { timestampMs: 1, image: new ImageData(16, 16) };

describe("live reconstruction optimization handoff", () => {
  it("publishes an applied optimized session back to live capture observers", async () => {
    const sessions: unknown[] = [];
    const processor = new LiveReconstructionProcessor({
      intrinsics: { fx: 100, fy: 100, cx: 8, cy: 8 },
      extractor: { extract: vi.fn(async () => featureSet) },
      matcher: { match: vi.fn(() => []) },
      poseEstimator: { estimate: vi.fn(async () => identityCameraPose()), reset: vi.fn() },
      onSession: (session) => sessions.push(session),
    });
    expect(await processor.process(frame)).toBe(true);
    const initial = processor.snapshot()!;
    const pose = { ...identityCameraPose(), translation: [0.01, 0, 0] as [number, number, number] };
    const optimized = { ...initial, createdAtMs: 2, map: { ...initial.map, version: initial.map.version + 1, keyframes: initial.map.keyframes.map((keyframe) => ({ ...keyframe, pose })) }, poses: { ...initial.poses, version: initial.poses.version + 1, poses: initial.poses.poses.map((item) => ({ ...item, pose })) } };
    expect(processor.applyOptimizedSession(optimized)).toBe(true);
    expect(sessions).toHaveLength(2);
    expect(processor.snapshot()?.poses.poses[0]?.pose.translation[0]).toBe(0.01);
    processor.dispose();
  });
});
