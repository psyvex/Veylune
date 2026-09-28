import type { CameraIntrinsics } from "./geometry";
import { verifyMatches } from "./geometry";
import type { FeatureMatcher, FeatureSet } from "./features";
import { retainReliableMatches } from "./features";
import type { CameraPose } from "./triangulation";
import type { LivePoseEstimator } from "./live-reconstruction";
import type { ScanFrame } from "./live-scan";
import type { VisionExtractor } from "./live-vision";
import { robustEstimateEssentialMatrix, decomposeEssentialMatrix, selectPoseByCheirality, epipolarErrors, essentialFromRelativePose } from "./essential-matrix";

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

    // Flow measures the mean image displacement directly from the matched
    // features — used both as the fallback pose and as the direction seed for
    // candidate scoring below.
    const flow = motionFromMatches(this.previous, features, geometry.inliers, this.options.intrinsics, this.options.translationScale);

    if (geometry.inliers.length >= this.options.minimumInliers && geometry.confidence > 0) {
      const base = previous ?? this.current ?? identityPose();
      let estimate: MotionEstimate | undefined;
      if (geometry.inliers.length >= 8) {
        const all1 = geometry.inliers.map(m => this.previous!.keypoints[m.referenceIndex]!);
        const all2 = geometry.inliers.map(m => features.keypoints[m.currentIndex]!);
        const robust = robustEstimateEssentialMatrix(all1, all2, this.options.intrinsics, { iterations: 200, thresholdPx: 2.5 });
        if (robust) {
          // Keep only epipolar inliers so cheirality and triangulation see clean matches
          const pts1: { x: number; y: number }[] = [];
          const pts2: { x: number; y: number }[] = [];
          for (let i = 0; i < all1.length; i++) if (robust.inliers[i]) { pts1.push(all1[i]!); pts2.push(all2[i]!); }
          if (pts1.length >= 8) {
            // At walking-frame parallax (≈0.02 rad) a 8-point sample of the
            // TRUE model leaves residuals of several px, while a 3-DOF
            // "camera slid along the optical axis" impostor fits every match —
            // RANSAC counts always prefer the impostor. Seed the search with
            // the direction flow actually MEASURED and let the full geometric
            // cost pick the winner; the true pose beats the impostor's cost by
            // an order of magnitude on every outer point. The grid is crossed
            // with the rotations from flow AND the decomposition — flow's roll
            // is itself swamped by differential parallax noise on near scenes,
            // while E's rotation stays sharp; pairing good R with good t is
            // what produces a true-pose candidate at all.
            const eCandidates = decomposeEssentialMatrix(robust.E);
            const candidates: MotionEstimate[] = [];
            if (flow) {
              const rotations: MotionEstimate["rotation"][] = [flow.rotation];
              for (const c of eCandidates) {
                if (!rotations.some((r) => sameRotation(r, c.rotation))) rotations.push(c.rotation);
              }
              for (const seed of translationGridFromFlow(flow)) {
                for (const rotation of rotations) candidates.push({ rotation, translation: seed.translation });
              }
            }
            candidates.push(...eCandidates);
            estimate = bestGeometricPose(candidates, pts1, pts2, this.options.intrinsics, this.options.translationScale);
            if (estimate) estimate = { rotation: estimate.rotation, translation: worldDeltaFromRelative(base, estimate) };
          }
        }
      }
      if (!estimate && flow) {
        // Flow returns its delta in camera terms (relative rotation + the
        // translation field standing for t = R₂(C₁−C₂)); convert to a world
        // center displacement the same way the essential-matrix path does.
        estimate = { rotation: flow.rotation, translation: worldDeltaFromRelative(base, flow) };
      }
      if (estimate) this.current = composePose(base, estimate.rotation, estimate.translation);
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
  // Image-space rotation of the matched pattern about its centroid. Features
  // drift opposite to camera motion, so a clockwise (y-down) pattern rotation
  // means the camera rolled the other way about its optical axis — a Z-axis
  // rotation in the y-down image convention, NOT a yaw. (A yaw here rotates
  // every triangulation ray around the wrong axis and the map gets no points.)
  const angle = Number.isFinite(cross) && Number.isFinite(dot) && (cross !== 0 || dot !== 0) ? Math.atan2(cross, dot) : 0;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const rotation: CameraPose["rotation"] = [cos, sin, 0, -sin, cos, 0, 0, 0, 1];
  const dx = (meanB.x - meanA.x) / Math.max(intrinsics.fx, 1);
  const dy = (meanB.y - meanA.y) / Math.max(intrinsics.fy, 1);
  const scale = Math.max(0.001, translationScale);
  // Camera-frame motion t = R₂(C₁−C₂): features moved by (+dx,+dy), so C₁−C₂
  // points the same way; worldDeltaFromRelative applies the negation. Rotation
  // is returned even with zero translation — losing it poisoned every pose
  // after a tilt-only segment.
  return { rotation, translation: [(Number.isFinite(dx) ? dx : 0) * scale, (Number.isFinite(dy) ? dy : 0) * scale, 0] };
}

/**
 * Translation candidates sharing the flow-measured in-plane direction with a
 * range of optical-axis mixtures (t is scale-free for epipolar geometry, so
 * only the direction matters). The flow direction is measurement, not model —
 * it can never produce the "pure forward drift" impostor that RANSAC counts
 * keep selecting at small parallax.
 */
function sameRotation(a: CameraPose["rotation"], b: CameraPose["rotation"]): boolean {
  for (let i = 0; i < 9; i++) if (Math.abs(a[i]! - b[i]!) > 1e-6) return false;
  return true;
}

function translationGridFromFlow(flow: MotionEstimate): MotionEstimate[] {
  const dx = flow.translation[0]!, dy = flow.translation[1]!;
  const inPlane = Math.hypot(dx, dy);
  if (inPlane < 1e-4) return []; // pure rotation / pure tilt — no direction to seed
  const out: MotionEstimate[] = [];
  for (let zMix = -0.8; zMix <= 0.81; zMix += 0.2) {
    // Unit length: epipolar geometry is translation-scale free, and the
    // cheirality prefilter rejects near-zero translations as degenerate.
    const mag = Math.hypot(dx, dy, zMix * inPlane) || 1;
    out.push({ rotation: flow.rotation, translation: [dx / mag, dy / mag, (zMix * inPlane) / mag] });
  }
  return out;
}

/**
 * Among cheirality-plausible candidates, pick the one whose epipolar geometry
 * fits ALL inlier matches best in total (capped) error — not the one that
 * merely keeps the most matches inside a generous threshold.
 */
export function bestGeometricPose(
  candidates: readonly MotionEstimate[],
  pts1: readonly { x: number; y: number }[],
  pts2: readonly { x: number; y: number }[],
  intrinsics: CameraIntrinsics,
  translationScale: number,
): MotionEstimate | undefined {
  // Cap gross outliers so one nonsense correspondence can't swamp the
  // comparison, but cap 4× looser than the RANSAC gate — at the gate itself
  // every mediocre model saturates to the same "count × cap" total and the
  // comparison silently degenerates back into a tie.
  const tNorm = 10 / Math.max(intrinsics.fx, 1);
  const cap = tNorm * tNorm;
  const scored: { pose: MotionEstimate; cost: number }[] = [];
  for (const candidate of candidates) {
    const checked = selectPoseByCheirality([candidate], pts1, pts2, intrinsics, translationScale);
    if (!checked) continue;
    const errors = epipolarErrors(essentialFromRelativePose(checked.rotation, checked.translation), pts1, pts2, intrinsics);
    let cost = 0;
    for (const e of errors) cost += e < cap ? e : cap;
    scored.push({ pose: checked, cost });
  }
  if (scored.length === 0) return undefined;
  const bestCost = Math.min(...scored.map((s) => s.cost));
  // Within a 25% cost band the models are statistically indistinguishable at
  // this noise level — a tie-break, not a coin flip: prefer the SMALLEST
  // optical-axis component. Handheld captures overwhelmingly move laterally
  // (the guidance literally tells users to arc around the subject), and the
  // forward-drift model is the classic monocular failure; when the data
  // cannot tell them apart, the prior decides. With healthy parallax the
  // wrong-axis models fall outside the band and the raw cost still rules.
  const inBand = scored.filter((s) => s.cost <= bestCost * 1.25);
  let best = inBand[0]!;
  for (const s of inBand) {
    const zPrev = Math.abs(best.pose.translation[2]!);
    const zNow = Math.abs(s.pose.translation[2]!);
    if (zNow < zPrev - 1e-9 || (Math.abs(zNow - zPrev) <= 1e-9 && s.cost < best.cost)) best = s;
  }
  return best.pose;
}

/**
 * selectPoseByCheirality returns t in the NEW camera frame (t = R₂(C₁−C₂));
 * pose composition moves world centers, so convert: ΔC = C₂−C₁ = −R_newᵀ·t.
 */
export function worldDeltaFromRelative(base: CameraPose, relative: MotionEstimate): CameraPose["translation"] {
  const rNew = multiply3(base.rotation, relative.rotation);
  const t = relative.translation;
  return [
    -(rNew[0]! * t[0]! + rNew[3]! * t[1]! + rNew[6]! * t[2]!),
    -(rNew[1]! * t[0]! + rNew[4]! * t[1]! + rNew[7]! * t[2]!),
    -(rNew[2]! * t[0]! + rNew[5]! * t[1]! + rNew[8]! * t[2]!),
  ];
}

export function composePose(base: CameraPose, rotation: CameraPose["rotation"], translation: CameraPose["translation"]): CameraPose {
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
