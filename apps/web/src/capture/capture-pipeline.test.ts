import { describe, expect, it } from "vitest";
import { CapturePipeline, type CaptureFrame } from "./capture-pipeline";
import type { FeatureMatcher, FeatureSet } from "./features";
import { identityCameraPose } from "./keyframe-pose";
import { KeyframePolicy } from "./keyframe-policy";

const features = (offset = 0): FeatureSet => ({ keypoints: Array.from({ length: 12 }, (_, index) => ({ x: 100 + index - offset, y: 80 + index, score: 1 })), descriptors: [] });
const matcher: FeatureMatcher = { match: () => Array.from({ length: 12 }, (_, index) => ({ referenceIndex: index, currentIndex: index, distance: 0.1 })) };
const frame = (id: string, index: number, offset = 0): CaptureFrame => ({ id, frameIndex: index, timestampMs: index + 1, features: features(offset) });

describe("CapturePipeline", () => {
  it("initializes from a feature frame", () => { const pipeline = new CapturePipeline({ intrinsics: { fx: 100, fy: 100, cx: 0, cy: 0 } }); const result = pipeline.initialize(frame("kf-0", 0)); expect(result.accepted).toBe(true); expect(result.session?.map.keyframes).toHaveLength(1); expect(result.session?.map.landmarks).toHaveLength(0); });
  it("turns tracked parallax into landmarks and observations", () => { const pipeline = new CapturePipeline({ intrinsics: { fx: 100, fy: 100, cx: 0, cy: 0 } }); pipeline.initialize(frame("kf-0", 0)); const pose = { ...identityCameraPose(), translation: [1, 0, 0] as [number, number, number] }; const result = pipeline.process(frame("kf-1", 1, 10), matcher, pose); expect(result.accepted).toBe(true); expect(result.reason).toBe("tracked"); expect(result.session?.map.keyframes).toHaveLength(2); expect(result.session?.map.landmarks).toHaveLength(12); expect(result.session?.observations).toHaveLength(24);
      // Pair-triangulated landmarks are two-view points from birth — the PLY
      // export gate (observations >= 2) must find every one of them.
      expect(result.session?.map.landmarks.every((landmark) => landmark.observations >= 2)).toBe(true); });
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

  it("caps keyframe count by culling the oldest, keeping the reference and observation consistency", () => {
    const alwaysInsert = new KeyframePolicy({ minConfidence: 0, minInliers: 0, minTranslation: 0, minRotationRad: 0, maxIntervalMs: 0 });
    const pipeline = new CapturePipeline({ intrinsics: { fx: 100, fy: 100, cx: 0, cy: 0 }, keyframePolicy: alwaysInsert });
    pipeline.initialize(frame("kf-0", 0));
    let session = pipeline.snapshot();
    for (let index = 1; index <= 250; index += 1) {
      const pose = { ...identityCameraPose(), translation: [index * 0.01, 0, 0] as [number, number, number] };
      session = pipeline.process(frame(`kf-${index}`, index, 10), matcher, pose).session;
    }
    const snapshot = session!;
    expect(snapshot.map.keyframes.length).toBeLessThanOrEqual(241);
    expect(snapshot.map.keyframes.length).toBeGreaterThan(235);
    // The kept window is the newest keyframes; the pipeline's reference frame
    // (latest inserted keyframe) is always among them.
    expect(snapshot.map.keyframes.at(-1)?.id).toBe("kf-250");
    expect(snapshot.poses.poses).toHaveLength(snapshot.map.keyframes.length);
    const kept = new Set(snapshot.map.keyframes.map((keyframe) => keyframe.id));
    expect(snapshot.observations.every((observation) => kept.has(observation.keyframeId))).toBe(true);
  });
});
