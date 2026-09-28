import { describe, expect, it } from "vitest";
import { LiveReconstructionProcessor } from "./live-reconstruction";
import { LocalVisionExtractor, BruteForceDescriptorMatcher } from "./live-vision";
import { LocalPoseEstimator } from "./local-pose-estimator";
import { defaultIntrinsics } from "./geometry";
import { scanIntrinsics } from "./capture-app";
import type { ScanFrame } from "./live-scan";
import type { CameraPose } from "./triangulation";

// End-to-end odometry simulation: render a textured 3D point field through a
// known camera motion, feed the frames through the REAL extractor, matcher,
// pose estimator and capture pipeline, and require landmarks to appear.
// This is the regression net for geometric wiring bugs that unit tests miss —
// e.g. intrinsics stated in stream pixels while features are extracted from
// downscaled frames, which throws every triangulated point past the
// reprojection gate (keyframes climb, Points stays 0).

const WIDTH = 240;
const HEIGHT = 180;
const intrinsics = defaultIntrinsics(WIDTH, HEIGHT);

function seedRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

interface ScenePoint { readonly x: number; readonly y: number; readonly z: number; readonly mask: number[] }

function buildScene(count: number, seed: number): ScenePoint[] {
  const rnd = seedRandom(seed);
  return Array.from({ length: count }, () => ({
    x: (rnd() - 0.5) * 1.2,
    y: (rnd() - 0.5) * 0.9,
    z: 1.2 + rnd() * 1.6,
    // Unique 3×3 luminance patch — gives each point a distinctive gradient
    // footprint the descriptor can lock onto.
    mask: Array.from({ length: 9 }, () => 30 + Math.floor(rnd() * 220)),
  }));
}

/** World-to-camera pose: in-plane roll about z and a translating center. */
function cameraPose(step: number): CameraPose {
  const phi = 0.02 * step;
  const c = Math.cos(phi), s = Math.sin(phi);
  return {
    rotation: [c, -s, 0, s, c, 0, 0, 0, 1],
    translation: [0.05 * step, 0, 0],
  };
}

function renderFrame(scene: ScenePoint[], pose: CameraPose): ScanFrame {
  const data = new Uint8ClampedArray(WIDTH * HEIGHT * 4);
  // Alpha opaque so the frame looks like a decoded camera image.
  for (let i = 3; i < data.length; i += 4) data[i] = 255;
  const R = pose.rotation;
  for (const point of scene) {
    const lx = point.x - pose.translation[0], ly = point.y - pose.translation[1], lz = point.z - pose.translation[2];
    const px = R[0]! * lx + R[1]! * ly + R[2]! * lz;
    const py = R[3]! * lx + R[4]! * ly + R[5]! * lz;
    const pz = R[6]! * lx + R[7]! * ly + R[8]! * lz;
    if (pz < 0.4) continue;
    const u = Math.round(intrinsics.fx * (px / pz) + intrinsics.cx);
    const v = Math.round(intrinsics.fy * (py / pz) + intrinsics.cy);
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const x = u + dx, y = v + dy;
        if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT) continue;
        const i = (y * WIDTH + x) * 4;
        const value = point.mask![(dy + 1) * 3 + (dx + 1)]!;
        data[i] = value; data[i + 1] = value; data[i + 2] = value;
      }
    }
  }
  return { timestampMs: Math.round(pose.translation[0] * 2000), image: new ImageData(data, WIDTH, HEIGHT) };
}

describe("live reconstruction odometry simulation", () => {
  it("triangulates landmarks from a translating, rolling camera over a textured field", async () => {
    const scene = buildScene(160, 42);
    const extractor = new LocalVisionExtractor({ maxKeypoints: 512, minScore: 0.08 });
    const matcher = new BruteForceDescriptorMatcher(0.85);
    const processor = new LiveReconstructionProcessor({
      intrinsics,
      extractor,
      matcher,
      poseEstimator: new LocalPoseEstimator({ intrinsics, extractor, matcher }),
    });
    // RANSAC samples with Math.random; pin it so a green run is reproducible.
    let seed = 9876;
    const realRandom = Math.random;
    Math.random = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    try {
      for (let step = 0; step < 12; step += 1) await processor.process(renderFrame(scene, cameraPose(step)));
    } finally {
      Math.random = realRandom;
    }
    const session = processor.snapshot();
    // The chain fails loudly here if intrinsics/feature scales disagree —
    // exactly the failure the user reported: keyframes rise, Points stays 0.
    expect(session?.map.keyframes.length ?? 0).toBeGreaterThan(2);
    expect(session?.map.landmarks.length ?? 0).toBeGreaterThan(10);
    // Landmarks must carry real colors sampled from the rendered frames —
    // the exported PLY is otherwise the flat-blue map the user reported.
    // The scene renders grayscale patches (mask luminance 30-250).
    const colors = processor.colors();
    expect(colors.size).toBeGreaterThan(5);
    for (const [id, rgb] of colors) {
      expect(session!.map.landmarks.some((l) => l.id === id)).toBe(true);
      const [r, g, b] = rgb;
      expect(r).toBe(g); expect(g).toBe(b);
      expect(r).toBeGreaterThanOrEqual(0); expect(r).toBeLessThanOrEqual(251);
    }
    expect(new Set([...colors.values()].map((c) => c[0])).size).toBeGreaterThan(1);
    // Odometry must WALK ALONG THE TRUE PATH, not slide along the optical
    // axis. A degenerate "forward drift" essential matrix also triangulates
    // points, so landmark counts alone can't catch it — the translation
    // direction can. The rig moves +x in world; the last keyframe center has
    // to be x-dominant and positive.
    const pose = session?.map.keyframes.at(-1)?.pose;
    expect(pose).toBeDefined();
    const [cx, , cz] = pose!.translation;
    expect(cx!).toBeGreaterThan(Math.abs(cz!));
    expect(cx!).toBeGreaterThan(0);
    processor.dispose();
  });

  it("relocalizes after a tracking blackout instead of discarding the map", async () => {
    const scene = buildScene(160, 42);
    const extractor = new LocalVisionExtractor({ maxKeypoints: 512, minScore: 0.08 });
    const matcher = new BruteForceDescriptorMatcher(0.85);
    const processor = new LiveReconstructionProcessor({
      intrinsics,
      extractor,
      matcher,
      poseEstimator: new LocalPoseEstimator({ intrinsics, extractor, matcher }),
    });
    let seed = 9876;
    const realRandom = Math.random;
    Math.random = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    try {
      for (let step = 0; step < 8; step += 1) await processor.process(renderFrame(scene, cameraPose(step)));
      const keyframesBefore = processor.snapshot()?.map.keyframes.length ?? 0;
      const landmarksBefore = processor.snapshot()?.map.landmarks.length ?? 0;
      expect(keyframesBefore).toBeGreaterThan(2);
      expect(landmarksBefore).toBeGreaterThan(5);
      // Occlusion/blur blackout: no usable features three frames running must
      // drop tracking to "lost" — but the map must NOT be thrown away.
      const blank = renderFrame([], cameraPose(8));
      await processor.process(blank);
      await processor.process(blank);
      await processor.process(blank);
      expect(processor.trackingState).toBe("lost");
      // Scene returns: the processor must re-anchor onto an earlier keyframe
      // and keep every landmark captured before the blackout.
      const recovered = await processor.process(renderFrame(scene, cameraPose(9)));
      expect(recovered).toBe(true);
      expect(processor.lastRejectReason).toBe("");
      const session = processor.snapshot();
      expect(session?.map.landmarks.length ?? 0).toBe(landmarksBefore);
      expect(session?.map.keyframes.length ?? 0).toBeGreaterThan(keyframesBefore);
      // The re-anchored pose must sit on the true walking path, not at the
      // old keyframe or somewhere random.
      const pose = session?.map.keyframes.at(-1)?.pose;
      expect(pose).toBeDefined();
      const [cx, , cz] = pose!.translation;
      expect(cx!).toBeGreaterThan(Math.abs(cz!));
      expect(cx!).toBeGreaterThan(0);
    } finally {
      Math.random = realRandom;
    }
    processor.dispose();
  });

  it("still triangulates at downscaled (960-wide) frame sizes with stream-size intrinsics fixed", async () => {
    // scanIntrinsics must state fx/cx for the DOWNSCALED pixels the pipeline
    // sees from a 1280-wide stream. Wrong scale = the reported field bug.
    const scaled = scanIntrinsics(1280, 720);
    const direct = defaultIntrinsics(960, 540);
    expect(scaled).toEqual(direct);
    expect(scanIntrinsics(640, 480)).toEqual(defaultIntrinsics(640, 480)); // no upscale when already small
    expect(scanIntrinsics(1280, 720).fx).toBeLessThan(defaultIntrinsics(1280, 720).fx);
  });
});
