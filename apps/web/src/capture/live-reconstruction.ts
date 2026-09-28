import type { CameraPose } from "./triangulation";
import type { FeatureMatcher, FeatureSet } from "./features";
import { estimateTrackingConfidence, retainReliableMatches } from "./features";
import { verifyMatches, type CameraIntrinsics } from "./geometry";
import { CapturePipeline, histogramIntersection, spatialSignature, type CaptureFrame, type CapturePipelineOptions } from "./capture-pipeline";
import type { ScanFrame, ScanProcessor } from "./live-scan";
import type { VisionExtractor } from "./live-vision";
import { TrackingRecovery, type TrackingState } from "./tracking-recovery";
import type { ReconstructionOptimizationBridge } from "./reconstruction-optimization-bridge";
import type { ReconstructionSessionSnapshot } from "./reconstruction-session";
import { decomposeEssentialMatrix, robustEstimateEssentialMatrix } from "./essential-matrix";
import { DEFAULT_RELOCALIZATION_POLICY, selectRelocalizationCandidate, type RelocalizationCandidate } from "./relocalization";
import { bestGeometricPose, composePose, worldDeltaFromRelative } from "./local-pose-estimator";

/** Frames the processor tolerates without a successful relocalization before
 * it concedes the map is unrecoverable and resets (~5 s at the 12 fps cap). */
const RELOCALIZE_TIMEOUT_FRAMES = 60;
/** Descriptor-match sweep cap per attempt — relocalization runs every frame
 * while lost, so keep the brute-force budget bounded. */
const RELOCALIZE_CANDIDATES = 3;
/** Relative-translation magnitude prior for a re-anchor jump (same scale the
 * frame-to-frame estimator assumes). */
const RELOCALIZE_TRANSLATION_SCALE = 0.5;

export interface LivePoseEstimator { estimate(frame: ScanFrame, previous?: CameraPose): Promise<CameraPose | undefined>; reset(): void; }
export interface LiveReconstructionProcessorOptions extends CapturePipelineOptions { readonly extractor: VisionExtractor; readonly matcher: FeatureMatcher; readonly poseEstimator: LivePoseEstimator; readonly onSession?: (session: NonNullable<ReturnType<CapturePipeline["snapshot"]>>) => void; readonly recovery?: TrackingRecovery; readonly optimizationBridge?: ReconstructionOptimizationBridge; }
export class LiveReconstructionProcessor implements ScanProcessor {
  private readonly pipeline: CapturePipeline; private previousPose: CameraPose | undefined; private previousFeatures: CaptureFrame["features"] | undefined; private frameIndex = 0; private readonly extractor: VisionExtractor; private readonly matcher: FeatureMatcher; private readonly poseEstimator: LivePoseEstimator; private readonly onSession: LiveReconstructionProcessorOptions["onSession"]; private readonly recovery: TrackingRecovery; private optimizationBridge: ReconstructionOptimizationBridge | undefined; private readonly intrinsics: CameraIntrinsics; private readonly geometryThresholdPx: number; private relocalizing = false; private relocalizeAttempts = 0;
  lastRejectReason = "";
  lastKeypoints: readonly { readonly x: number; readonly y: number }[] = [];
  lastFrameWidth = 0;
  lastFrameHeight = 0;
  constructor(options: LiveReconstructionProcessorOptions) { this.pipeline = new CapturePipeline(options); this.intrinsics = options.intrinsics; this.geometryThresholdPx = options.geometryThresholdPx ?? 16; this.extractor = options.extractor; this.matcher = options.matcher; this.poseEstimator = options.poseEstimator; this.onSession = options.onSession; this.recovery = options.recovery ?? new TrackingRecovery(); this.optimizationBridge = options.optimizationBridge; }
  setOptimizationBridge(bridge: ReconstructionOptimizationBridge | undefined): void { this.optimizationBridge = bridge; }
  get trackingState(): TrackingState { return this.recovery.current; }
  async process(frame: ScanFrame): Promise<boolean> {
    const features = await this.extractor.extract(frame);
    this.lastKeypoints = features.keypoints; this.lastFrameWidth = frame.image.width; this.lastFrameHeight = frame.image.height;
    if (features.keypoints.length < 4) { this.lastRejectReason = `low-features(${features.keypoints.length})`; this.handleFailure(); return false; }
    if (this.relocalizing) return this.attemptRelocalization(frame, features);
    const pose = await this.poseEstimator.estimate(frame, this.previousPose);
    if (!pose) { this.lastRejectReason = "pose-failed"; this.handleFailure(); return false; }
    const captureFrame: CaptureFrame = { id: `frame:${this.frameIndex}`, frameIndex: this.frameIndex++, timestampMs: frame.timestampMs, features, image: frame.image };
    const result = this.previousFeatures ? this.pipeline.process(captureFrame, this.matcher, pose) : this.pipeline.initialize(captureFrame, pose);
    if (!result.accepted) { this.lastRejectReason = `${result.reason}(inliers=${result.inliers},conf=${result.confidence.toFixed(2)})`; this.handleFailure(); return false; }
    this.lastRejectReason = ""; this.recovery.accept(); this.previousFeatures = features; this.previousPose = pose;
    if (result.session) this.onSession?.(result.session);
    if (result.keyframeInserted) this.optimizationBridge?.notifyKeyframeInserted();
    return true;
  }
  reset(): void { this.pipeline.reset(); this.poseEstimator.reset(); this.recovery.reset(); this.optimizationBridge?.cancel(); this.previousPose = undefined; this.previousFeatures = undefined; this.frameIndex = 0; this.relocalizing = false; this.relocalizeAttempts = 0; }
  snapshot() { return this.pipeline.snapshot(); }
  /** RGB for each landmark, sampled from the real camera pixels at
   * triangulation time — what makes the exported PLY the scene's colors
   * instead of one flat blue. */
  colors(): ReadonlyMap<string, readonly [number, number, number]> { return this.pipeline.colors(); }
  applyOptimizedSession(session: ReconstructionSessionSnapshot): boolean { const applied = this.pipeline.applyOptimizedSnapshot(session); if (applied) this.onSession?.(this.pipeline.snapshot()!); return applied; }
  dispose(): void { this.optimizationBridge?.dispose(); this.reset(); }
  /** Losing tracking no longer discards the map. The processor enters a
   * relocalization mode instead and every subsequent usable frame tries to
   * re-anchor onto an existing keyframe (see attemptRelocalization). The map
   * is only reset once the map is genuinely invalid (attempt timeout) or the
   * user stops the capture. */
  private handleFailure(): void {
    if (this.recovery.reject() === "lost") {
      if (!this.relocalizing) {
        this.relocalizing = true; this.relocalizeAttempts = 0;
        this.previousPose = undefined; this.previousFeatures = undefined; this.poseEstimator.reset();
      }
      return;
    }
    if (this.relocalizing && ++this.relocalizeAttempts > RELOCALIZE_TIMEOUT_FRAMES) this.giveUpOnRelocalization();
  }
  private giveUpOnRelocalization(): void {
    this.relocalizing = false; this.relocalizeAttempts = 0;
    this.pipeline.reset(); this.poseEstimator.reset(); this.recovery.reset(); this.optimizationBridge?.cancel();
    this.previousPose = undefined; this.previousFeatures = undefined;
  }
  /** Recover from a tracking blackout without discarding the map: match the
   * frame's descriptors against recent keyframes, and when a strong match is
   * found estimate the camera's pose RELATIVE to that keyframe with the
   * essential matrix, compose it with the keyframe's known pose and re-anchor
   * there. Losing tracking because the camera moved too fast for frame-to-
   * frame odometry should never mean losing the whole scan. */
  private attemptRelocalization(frame: ScanFrame, features: FeatureSet): boolean {
    this.relocalizeAttempts += 1;
    if (this.relocalizeAttempts > RELOCALIZE_TIMEOUT_FRAMES) { this.giveUpOnRelocalization(); return false; }
    const signature = spatialSignature(features);
    const ranked = this.pipeline.relocalizationFrames()
      .map((candidate) => ({ candidate, similarity: histogramIntersection(signature, candidate.signature) }))
      // Descriptor-only sweeps are O(n²) per pair, so a frame can revisit only
      // the few keyframes whose feature layout it actually resembles.
      .filter((entry) => entry.similarity > 0)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, RELOCALIZE_CANDIDATES);
    const candidates: RelocalizationCandidate[] = [];
    const observations = new Map<string, { pose: CameraPose; reference: readonly { x: number; y: number }[]; current: readonly { x: number; y: number }[] }>();
    for (const { candidate } of ranked) {
      const matches = retainReliableMatches(this.matcher.match(candidate.features, features), 1.2);
      if (matches.length < DEFAULT_RELOCALIZATION_POLICY.minimumMatches) continue;
      const geometry = verifyMatches(candidate.features.keypoints, features.keypoints, matches, this.geometryThresholdPx);
      const reference = geometry.inliers.map((match) => candidate.features.keypoints[match.referenceIndex]!);
      const current = geometry.inliers.map((match) => features.keypoints[match.currentIndex]!);
      candidates.push({ keyframeId: candidate.id, matches: geometry.inliers, confidence: Math.min(estimateTrackingConfidence(geometry.inliers), geometry.confidence) });
      observations.set(candidate.id, { pose: candidate.pose, reference, current });
    }
    const best = selectRelocalizationCandidate(candidates);
    const observed = best ? observations.get(best.keyframeId) : undefined;
    if (!observed || observed.reference.length < 8) {
      this.lastRejectReason = `relocalize:no-candidate(${candidates.map((candidate) => `${candidate.matches.length}m/${candidate.confidence.toFixed(2)}`).join(",")})`;
      return false;
    }
    const robust = robustEstimateEssentialMatrix(observed.reference, observed.current, this.intrinsics, { iterations: 200, thresholdPx: 2.5 });
    if (!robust) { this.lastRejectReason = "relocalize:no-essential"; return false; }
    const inliers = { reference: [] as { x: number; y: number }[], current: [] as { x: number; y: number }[] };
    for (let index = 0; index < robust.inliers.length; index += 1) {
      if (!robust.inliers[index]) continue;
      inliers.reference.push(observed.reference[index]!);
      inliers.current.push(observed.current[index]!);
    }
    if (inliers.reference.length < 8) { this.lastRejectReason = `relocalize:too-few-epipolar-inliers(${inliers.reference.length})`; return false; }
    const relative = bestGeometricPose(decomposeEssentialMatrix(robust.E), inliers.reference, inliers.current, this.intrinsics, RELOCALIZE_TRANSLATION_SCALE);
    if (!relative) { this.lastRejectReason = "relocalize:no-cheirality"; return false; }
    const pose = composePose(observed.pose, relative.rotation, worldDeltaFromRelative(observed.pose, relative));
    const captureFrame: CaptureFrame = { id: `frame:${this.frameIndex}`, frameIndex: this.frameIndex++, timestampMs: frame.timestampMs, features, image: frame.image };
    const result = this.pipeline.reanchor(captureFrame, pose);
    if (!result.accepted) { this.lastRejectReason = `relocalize:reanchor-rejected(${result.reason})`; return false; }
    this.relocalizing = false; this.relocalizeAttempts = 0; this.lastRejectReason = "";
    this.previousFeatures = features; this.previousPose = pose;
    this.recovery.accept();
    if (result.session) this.onSession?.(result.session);
    if (result.keyframeInserted) this.optimizationBridge?.notifyKeyframeInserted();
    return true;
  }
}
