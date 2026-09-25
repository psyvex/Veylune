import type { CameraIntrinsics } from "./geometry";
import { verifyMatches } from "./geometry";
import type { FeatureMatcher, FeatureSet } from "./features";
import { retainReliableMatches } from "./features";
import type { CameraPose } from "./triangulation";
import type { LivePoseEstimator } from "./live-reconstruction";
import type { ScanFrame } from "./live-scan";
import type { VisionExtractor } from "./live-vision";
import { estimateEssentialMatrix, decomposeEssentialMatrix, selectPoseByCheirality } from "./essential-matrix";

export interface LocalPoseEstimatorOptions {
  readonly intrinsics: CameraIntrinsics;
  readonly extractor: VisionExtractor;
  readonly matcher: FeatureMatcher;
  readonly maxMatchDistance?: number;
  readonly geometryThresholdPx?: number;
  readonly translationScale?: number;
  readonly minimumInliers?: number;
}

/** Browser-local incremental pose estimate. Translation is intentionally scale-normalized. */
export class LocalPoseEstimator implements LivePoseEstimator {
  private readonly options: Required<Omit<LocalPoseEstimatorOptions, "intrinsics" | "extractor" | "matcher">> & Pick<LocalPoseEstimatorOptions, "intrinsics" | "extractor" | "matcher">;
  private previous: FeatureSet | undefined;
  private current: CameraPose | undefined;

  constructor(options: LocalPoseEstimatorOptions) {
    this.options = {
      maxMatchDistance: 1.2,
      geometryThresholdPx: 16,
      translationScale: 0.5,
      minimumInliers: 2,
      ...options,
    };
  }

  async estimate(frame: ScanFrame, previous?: CameraPose): Promise<CameraPose | undefined> {
    const features = await this.options.extractor.extract(frame);
    if (features.keypoints.length < 4) return undefined;
    if (!this.previous) {
      this.previous = features;
      this.current = previous ?? identityPose();
      return this.current;
    }

    const matches = retainReliableMatches(this.options.matcher.match(this.previous, features), this.options.maxMatchDistance);
    const geometry = verifyMatches(this.previous.keypoints, features.keypoints, matches, this.options.geometryThresholdPx);

    if (geometry.inliers.length >= this.options.minimumInliers && geometry.confidence > 0) {
      const pts1 = geometry.inliers.map(m => this.previous!.keypoints[m.referenceIndex]!);
      const pts2 = geometry.inliers.map(m => features.keypoints[m.currentIndex]!);
      const E = pts1.length >= 8 ? estimateEssentialMatrix(pts1, pts2, this.options.intrinsics) : undefined;
      const estimate = E
        ? selectPoseByCheirality(decomposeEssentialMatrix(E), pts1, pts2, this.options.intrinsics, this.options.translationScale)
        : motionFromMatches(this.previous, features, geometry.inliers, this.options.intrinsics, this.options.translationScale);
      if (estimate) {
        const base = previous ?? this.current ?? identityPose();
        this.current = composePose(base, estimate.rotation, estimate.translation);
      }
    }

    // Fall back to last known pose rather than returning undefined — lets the
    // pipeline's keyframe policy (time gate) still fire even without feature motion.
    this.previous = features;
    return this.current ?? identityPose();
  }

  reset(): void {
    this.previous = undefined;
    this.current = undefined;
  }
}

interface MotionEstimate { readonly rotation: CameraPose["rotation"]; readonly translation: CameraPose["translation"]; }

function motionFromMatches(reference: FeatureSet, current: FeatureSet, inliers: readonly { referenceIndex: number; currentIndex: number }[], intrinsics: CameraIntrinsics, translationScale: number): MotionEstimate | undefined {
  if (inliers.length < 2) return undefined;
  const pairs = inliers.map((match) => ({ a: reference.keypoints[match.referenceIndex]!, b: current.keypoints[match.currentIndex]! }));
  const meanA = mean(pairs.map((pair) => pair.a));
  const meanB = mean(pairs.map((pair) => pair.b));
  let cross = 0;
  let dot = 0;
  for (const pair of pairs) {
    const ax = pair.a.x - meanA.x, ay = pair.a.y - meanA.y;
    const bx = pair.b.x - meanB.x, by = pair.b.y - meanB.y;
    cross += ax * by - ay * bx;
    dot += ax * bx + ay * by;
  }
  const angle = Math.atan2(cross, dot);
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const rotation: CameraPose["rotation"] = [cos, 0, sin, 0, 1, 0, -sin, 0, cos];
  const dx = (meanB.x - meanA.x) / Math.max(intrinsics.fx, 1);
  const dy = (meanB.y - meanA.y) / Math.max(intrinsics.fy, 1);
  const magnitude = Math.hypot(dx, dy);
  if (!Number.isFinite(magnitude) || magnitude < 1e-5) return undefined;
  const scale = Math.max(0.001, translationScale);
  // Negate: optical flow shows where features moved, camera moved opposite direction
  return { rotation, translation: [-dx * scale, -dy * scale, 0] };
}

function composePose(base: CameraPose, rotation: CameraPose["rotation"], translation: CameraPose["translation"]): CameraPose {
  return {
    rotation: multiply3(base.rotation, rotation),
    translation: [base.translation[0] + translation[0], base.translation[1] + translation[1], base.translation[2] + translation[2]],
  };
}

function multiply3(a: CameraPose["rotation"], b: CameraPose["rotation"]): CameraPose["rotation"] {
  const out = new Array<number>(9).fill(0);
  for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) for (let k = 0; k < 3; k++) out[row * 3 + col] += a[row * 3 + k]! * b[k * 3 + col]!;
  return out as unknown as CameraPose["rotation"];
}

function mean(points: readonly { x: number; y: number }[]): { x: number; y: number } {
  let x = 0, y = 0;
  for (const point of points) { x += point.x; y += point.y; }
  return { x: x / points.length, y: y / points.length };
}

function identityPose(): CameraPose { return { rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1], translation: [0, 0, 0] }; }
