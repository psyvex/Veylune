import { afterEach, describe, expect, it, vi } from "vitest";
import { LocalPoseEstimator } from "./local-pose-estimator";
import type { FeatureSet } from "./features";
import type { ScanFrame } from "./live-scan";

const frame = (timestampMs: number): ScanFrame => ({ timestampMs, image: new ImageData(16, 16) });
const pseudoRandom = (n: number): number => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const features = (offsetX = 0): FeatureSet => ({
  keypoints: Array.from({ length: 12 }, (_, index) => ({ x: 2 + (index % 4) * 3 + offsetX, y: 2 + Math.floor(index / 4) * 3, score: 1 })),
  descriptors: [],
});

// The E path runs RANSAC over Math.random; without a seed the inlier sample
// (and thus the synthetic y-bias) varies per process and the axis test flips.
function seedRandom(seed: number): void {
  let s = seed;
  vi.spyOn(Math, "random").mockImplementation(() => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  });
}

afterEach(() => vi.restoreAllMocks());

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
    seedRandom(9876);
    const reference = features();
    // Depth-varying parallax: a uniform shift over a coplanar grid is a
    // degenerate essential-matrix scene (a homography fits it exactly), so the
    // per-feature offsets scale with a fake 1/z gradient.
    const current: FeatureSet = {
      keypoints: reference.keypoints.map((kp, index) => ({ ...kp, x: kp.x + 4 * (0.4 + pseudoRandom(index + 1)) })),
      descriptors: [],
    };
    const estimator = new LocalPoseEstimator({
      intrinsics: { fx: 500, fy: 500, cx: 8, cy: 8 },
      extractor: { async extract(frame) { return frame.timestampMs === 0 ? reference : current; } },
      matcher: { match() { return Array.from({ length: 12 }, (_, index) => ({ referenceIndex: index, currentIndex: index, distance: 0.1 })); } },
    });
    const first = await estimator.estimate(frame(0));
    const second = await estimator.estimate(frame(33), first);
    expect(second).toBeDefined();
    // Features drift +x in the image, so the camera moves -x: optical flow is
    // negated when it becomes camera translation.
    expect(second!.translation[0]).toBeLessThan(0);
    // The E decomposition dominates the answer, so small synthetic-scene bias
    // is expected — assert the motion is clearly along x, not y.
    expect(Math.abs(second!.translation[1]!)).toBeLessThan(Math.abs(second!.translation[0]!) / 2);
  });

  it("falls back to the last pose when geometric support is missing", async () => {
    const estimator = new LocalPoseEstimator({
      intrinsics: { fx: 500, fy: 500, cx: 8, cy: 8 },
      extractor: { async extract() { return features(); } },
      matcher: { match() { return []; } },
    });
    await estimator.estimate(frame(0));
    // estimate() never returns undefined: the pipeline keeps the previous pose
    // alive and lets the epipolar-inlier gate decide tracking quality.
    expect(await estimator.estimate(frame(33))).toBeDefined();
  });
});

describe("LocalPoseEstimator flow fallback", () => {
  const center = { x: 16, y: 16 };
  const ringKeypoints = (rotation: number, jitter: (i: number) => { x: number; y: number }) =>
    Array.from({ length: 8 }, (_, i) => {
      const a = (i / 8) * Math.PI * 2;
      const px = center.x + Math.cos(a) * 6 + jitter(i).x;
      const py = center.y + Math.sin(a) * 6 + jitter(i).y;
      const dx = px - center.x, dy = py - center.y;
      const x = center.x + dx * Math.cos(rotation) - dy * Math.sin(rotation);
      const y = center.y + dx * Math.sin(rotation) + dy * Math.cos(rotation);
      return { x, y, score: 1 };
    });
  const ring = (points: { x: number; y: number; score: number }[]): FeatureSet => ({ keypoints: points, descriptors: [] });
  const identityMatches = { match: () => Array.from({ length: 8 }, (_, i) => ({ referenceIndex: i, currentIndex: i, distance: 0.1 })) };
  const noJitter = () => ({ x: 0, y: 0 });

  function estimatorFor(reference: FeatureSet, current: FeatureSet): LocalPoseEstimator {
    return new LocalPoseEstimator({
      intrinsics: { fx: 500, fy: 500, cx: 16, cy: 16 },
      extractor: { async extract(f) { return f.timestampMs === 0 ? reference : current; } },
      matcher: identityMatches,
    });
  }

  it("reports an in-plane roll (optical-axis rotation), not a yaw, when the pattern rotates", async () => {
    const alpha = 0.15; // image-space pattern rotation
    const estimator = estimatorFor(ring(ringKeypoints(0, noJitter)), ring(ringKeypoints(alpha, noJitter)));
    const first = await estimator.estimate(frame(0));
    const second = await estimator.estimate(frame(33), first);
    expect(second).toBeDefined();
    // The world-to-camera delta must be [cos a, sin a, 0, -sin a, cos a, 0, 0, 0, 1]
    // — the y-down in-plane rotation. The historical bug wrote a yaw matrix,
    // which rotated every ray around the wrong axis and starved the map of points.
    expect(second!.rotation[0]).toBeCloseTo(Math.cos(alpha), 2);
    expect(second!.rotation[1]).toBeCloseTo(Math.sin(alpha), 2);
    expect(second!.rotation[3]).toBeCloseTo(-Math.sin(alpha), 2);
    expect(second!.rotation[8]).toBeCloseTo(1, 5); // no out-of-plane component
    expect(second!.rotation[2]).toBeCloseTo(0, 5);
  });

  it("keeps rotation when there is no translational flow (tilt-only segment)", async () => {
    const alpha = 0.1;
    const estimator = estimatorFor(ring(ringKeypoints(0, noJitter)), ring(ringKeypoints(alpha, noJitter)));
    const first = await estimator.estimate(frame(0));
    const second = await estimator.estimate(frame(33), first);
    // Before the fix this returned undefined for pure rotation, silently
    // dropping the tilt; now the rotation survives and translation is ~0.
    expect(Math.acos(Math.min(1, (second!.rotation[0]! + second!.rotation[4]! + second!.rotation[8]! - 1) / 2))).toBeGreaterThan(0.03);
    expect(second!.translation[0]).toBeCloseTo(0, 3);
    expect(second!.translation[1]).toBeCloseTo(0, 3);
    expect(second!.translation[2]).toBeCloseTo(0, 3);
  });
});
