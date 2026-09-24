import { describe, expect, it } from "vitest";
import { CapturePipeline, type CaptureFrame } from "./capture-pipeline";
import type { FeatureMatcher, FeatureSet } from "./features";
import { identityCameraPose } from "./keyframe-pose";

const features = (offset = 0): FeatureSet => ({ keypoints: Array.from({ length: 12 }, (_, index) => ({ x: 100 + index - offset, y: 80 + index, score: 1 })), descriptors: [] });
const matcher: FeatureMatcher = { match: () => Array.from({ length: 12 }, (_, index) => ({ referenceIndex: index, currentIndex: index, distance: 0.1 })) };
const frame = (id: string, index: number, offset = 0): CaptureFrame => ({ id, frameIndex: index, timestampMs: index + 1, features: features(offset) });

describe("CapturePipeline", () => {
  it("initializes from a feature frame", () => { const pipeline = new CapturePipeline({ intrinsics: { fx: 100, fy: 100, cx: 0, cy: 0 } }); const result = pipeline.initialize(frame("kf-0", 0)); expect(result.accepted).toBe(true); expect(result.session?.map.keyframes).toHaveLength(1); expect(result.session?.map.landmarks).toHaveLength(0); });
  it("turns tracked parallax into landmarks and observations", () => { const pipeline = new CapturePipeline({ intrinsics: { fx: 100, fy: 100, cx: 0, cy: 0 } }); pipeline.initialize(frame("kf-0", 0)); const pose = { ...identityCameraPose(), translation: [1, 0, 0] as [number, number, number] }; const result = pipeline.process(frame("kf-1", 1, 10), matcher, pose); expect(result.accepted).toBe(true); expect(result.reason).toBe("tracked"); expect(result.session?.map.keyframes).toHaveLength(2); expect(result.session?.map.landmarks).toHaveLength(12); expect(result.session?.observations).toHaveLength(24); });
  it("preserves the last valid session when geometry is insufficient", () => { const pipeline = new CapturePipeline({ intrinsics: { fx: 100, fy: 100, cx: 0, cy: 0 } }); const initial = pipeline.initialize(frame("kf-0", 0)); const result = pipeline.process(frame("bad", 1), { match: () => [] }, identityCameraPose()); expect(result.accepted).toBe(false); expect(result.reason).toBe("insufficient-geometry"); expect(result.session).toEqual(initial.session); });
  it("applies an optimized map and pose graph back to live capture", () => {
    const pipeline = new CapturePipeline({ intrinsics: { fx: 100, fy: 100, cx: 0, cy: 0 } });
    const initial = pipeline.initialize(frame("kf-0", 0)).session!;
    const refinedPose = { ...identityCameraPose(), translation: [0.02, 0, 0] as [number, number, number] };
    const candidate = { ...initial, createdAtMs: 2, map: { ...initial.map, version: initial.map.version + 1, keyframes: initial.map.keyframes.map((keyframe) => ({ ...keyframe, pose: refinedPose })) }, poses: { ...initial.poses, version: initial.poses.version + 1, poses: initial.poses.poses.map((pose) => ({ ...pose, pose: refinedPose })) } };
    expect(pipeline.applyOptimizedSnapshot(candidate)).toBe(true);
    expect(pipeline.snapshot()?.poses.poses[0]?.pose.translation[0]).toBe(0.02);
    expect(pipeline.applyOptimizedSnapshot(candidate)).toBe(false);
  });
});
