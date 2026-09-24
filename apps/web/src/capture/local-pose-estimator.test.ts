import { describe, expect, it } from "vitest";
import { LocalPoseEstimator } from "./local-pose-estimator";
import type { FeatureSet } from "./features";
import type { ScanFrame } from "./live-scan";

const frame = (timestampMs: number): ScanFrame => ({ timestampMs, image: new ImageData(16, 16) });
const features = (offsetX = 0): FeatureSet => ({
  keypoints: Array.from({ length: 12 }, (_, index) => ({ x: 2 + (index % 4) * 3 + offsetX, y: 2 + Math.floor(index / 4) * 3, score: 1 })),
  descriptors: [],
});

describe("LocalPoseEstimator", () => {
  it("initializes from the supplied pose", async () => {
    let calls = 0;
    const estimator = new LocalPoseEstimator({
      intrinsics: { fx: 500, fy: 500, cx: 8, cy: 8 },
      extractor: { async extract() { calls++; return features(); } },
      matcher: { match() { return []; } },
    });
    const pose = await estimator.estimate(frame(0), { rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1], translation: [1, 2, 3] });
    expect(pose?.translation).toEqual([1, 2, 3]);
    expect(calls).toBe(1);
  });

  it("accumulates a small translation from consistent matches", async () => {
    const reference = features();
    const current = features(4);
    const estimator = new LocalPoseEstimator({
      intrinsics: { fx: 500, fy: 500, cx: 8, cy: 8 },
      extractor: { async extract(frame) { return frame.timestampMs === 0 ? reference : current; } },
      matcher: { match() { return Array.from({ length: 12 }, (_, index) => ({ referenceIndex: index, currentIndex: index, distance: 0.1 })); } },
    });
    const first = await estimator.estimate(frame(0));
    const second = await estimator.estimate(frame(33), first);
    expect(second).toBeDefined();
    expect(second!.translation[0]).toBeGreaterThan(0);
    expect(second!.translation[1]).toBeCloseTo(0);
  });

  it("rejects frames without enough geometric support", async () => {
    const estimator = new LocalPoseEstimator({
      intrinsics: { fx: 500, fy: 500, cx: 8, cy: 8 },
      extractor: { async extract() { return features(); } },
      matcher: { match() { return []; } },
    });
    await estimator.estimate(frame(0));
    expect(await estimator.estimate(frame(33))).toBeUndefined();
  });
});
