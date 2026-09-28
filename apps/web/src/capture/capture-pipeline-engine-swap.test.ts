import { describe, expect, it } from "vitest";
import { CapturePipeline, type CaptureFrame } from "./capture-pipeline";
import type { FeatureMatcher, FeatureSet } from "./features";
import { identityCameraPose } from "./keyframe-pose";
import { isReconstructionEngineReady } from "./reconstruction-engine-bootstrap.js";
import { loadEngineForNode as loadEngine } from "../engine/node-loader.js";

/**
 * Proves the live caller swap in `triangulation.ts`
 * (`triangulateCorrespondencesRouted`, ADR-013 Stage 1): the same fixture
 * `capture-pipeline.test.ts`'s "turns tracked parallax into landmarks and
 * observations" test uses must still produce the same landmark/observation
 * counts once the engine is loaded and driving triangulation. This is the
 * real `CapturePipeline.process()` path end to end, not a call-by-call
 * parity check (that's `triangulation-batch-wasm-parity.test.ts`).
 */

const features = (offset = 0): FeatureSet => ({ keypoints: Array.from({ length: 12 }, (_, index) => ({ x: 100 + index - offset, y: 80 + index, score: 1 })), descriptors: [] });
const matcher: FeatureMatcher = { match: () => Array.from({ length: 12 }, (_, index) => ({ referenceIndex: index, currentIndex: index, distance: 0.1 })) };
const frame = (id: string, index: number, offset = 0): CaptureFrame => ({ id, frameIndex: index, timestampMs: index + 1, features: features(offset) });

describe("CapturePipeline live caller swap (engine-driven triangulation)", () => {
  it("routes through the WASM triangulation batch once the engine is ready, and still produces the same landmarks/observations", async () => {
    await loadEngine();
    expect(isReconstructionEngineReady()).toBe(true);

    const pipeline = new CapturePipeline({ intrinsics: { fx: 100, fy: 100, cx: 0, cy: 0 } });
    pipeline.initialize(frame("kf-0", 0));
    const pose = { ...identityCameraPose(), translation: [1, 0, 0] as [number, number, number] };
    const result = pipeline.process(frame("kf-1", 1, 10), matcher, pose);

    expect(result.accepted).toBe(true);
    expect(result.reason).toBe("tracked");
    expect(result.session?.map.keyframes).toHaveLength(2);
    expect(result.session?.map.landmarks).toHaveLength(12);
    expect(result.session?.observations).toHaveLength(24);
    expect(result.session?.map.landmarks.every((landmark) => landmark.observations >= 2)).toBe(true);
  });
});
