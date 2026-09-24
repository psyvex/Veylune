import type { CameraPose } from "./triangulation";
import type { FeatureMatcher } from "./features";
import { CapturePipeline, type CaptureFrame, type CapturePipelineOptions } from "./capture-pipeline";
import type { ScanFrame, ScanProcessor } from "./live-scan";
import type { VisionExtractor } from "./live-vision";
import { TrackingRecovery, type TrackingState } from "./tracking-recovery";
import type { ReconstructionOptimizationBridge } from "./reconstruction-optimization-bridge";
import type { ReconstructionSessionSnapshot } from "./reconstruction-session";

export interface LivePoseEstimator { estimate(frame: ScanFrame, previous?: CameraPose): Promise<CameraPose | undefined>; reset(): void; }
export interface LiveReconstructionProcessorOptions extends CapturePipelineOptions { readonly extractor: VisionExtractor; readonly matcher: FeatureMatcher; readonly poseEstimator: LivePoseEstimator; readonly onSession?: (session: NonNullable<ReturnType<CapturePipeline["snapshot"]>>) => void; readonly recovery?: TrackingRecovery; readonly optimizationBridge?: ReconstructionOptimizationBridge; }
export class LiveReconstructionProcessor implements ScanProcessor {
  private readonly pipeline: CapturePipeline; private previousPose: CameraPose | undefined; private previousFeatures: CaptureFrame["features"] | undefined; private frameIndex = 0; private readonly extractor: VisionExtractor; private readonly matcher: FeatureMatcher; private readonly poseEstimator: LivePoseEstimator; private readonly onSession: LiveReconstructionProcessorOptions["onSession"]; private readonly recovery: TrackingRecovery; private optimizationBridge: ReconstructionOptimizationBridge | undefined;
  constructor(options: LiveReconstructionProcessorOptions) { this.pipeline = new CapturePipeline(options); this.extractor = options.extractor; this.matcher = options.matcher; this.poseEstimator = options.poseEstimator; this.onSession = options.onSession; this.recovery = options.recovery ?? new TrackingRecovery(); this.optimizationBridge = options.optimizationBridge; }
  setOptimizationBridge(bridge: ReconstructionOptimizationBridge | undefined): void { this.optimizationBridge = bridge; }
  get trackingState(): TrackingState { return this.recovery.current; }
  async process(frame: ScanFrame): Promise<boolean> { const features = await this.extractor.extract(frame); if (features.keypoints.length < 4) { this.handleFailure(); return false; } const pose = await this.poseEstimator.estimate(frame, this.previousPose); if (!pose) { this.handleFailure(); return false; } const captureFrame: CaptureFrame = { id: `frame:${this.frameIndex}`, frameIndex: this.frameIndex++, timestampMs: frame.timestampMs, features }; const result = this.previousFeatures ? this.pipeline.process(captureFrame, this.matcher, pose) : this.pipeline.initialize(captureFrame, pose); if (!result.accepted) { this.handleFailure(); return false; } this.recovery.accept(); this.previousFeatures = features; this.previousPose = pose; if (result.session) this.onSession?.(result.session); if (result.keyframeInserted) this.optimizationBridge?.notifyKeyframeInserted(); return true; }
  reset(): void { this.pipeline.reset(); this.poseEstimator.reset(); this.recovery.reset(); this.optimizationBridge?.cancel(); this.previousPose = undefined; this.previousFeatures = undefined; this.frameIndex = 0; }
  snapshot() { return this.pipeline.snapshot(); }
  applyOptimizedSession(session: ReconstructionSessionSnapshot): boolean { const applied = this.pipeline.applyOptimizedSnapshot(session); if (applied) this.onSession?.(this.pipeline.snapshot()!); return applied; }
  dispose(): void { this.optimizationBridge?.dispose(); this.reset(); }
  private handleFailure(): void { if (this.recovery.reject() === "lost") { this.pipeline.reset(); this.poseEstimator.reset(); this.optimizationBridge?.cancel(); this.previousPose = undefined; this.previousFeatures = undefined; } }
}
