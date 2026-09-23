import type { CameraPose } from "./triangulation";
import type { FeatureMatcher } from "./features";
import { CapturePipeline, type CaptureFrame, type CapturePipelineOptions } from "./capture-pipeline";
import type { ScanFrame, ScanProcessor } from "./live-scan";
import type { VisionExtractor } from "./live-vision";
export interface LivePoseEstimator { estimate(frame: ScanFrame, previous?: CameraPose): Promise<CameraPose | undefined>; reset(): void; }
export interface LiveReconstructionProcessorOptions extends CapturePipelineOptions { readonly extractor: VisionExtractor; readonly matcher: FeatureMatcher; readonly poseEstimator: LivePoseEstimator; readonly onSession?: (session: NonNullable<ReturnType<CapturePipeline["snapshot"]>>) => void; }
export class LiveReconstructionProcessor implements ScanProcessor {
  private readonly pipeline: CapturePipeline; private previousPose?: CameraPose; private previousFeatures?: CaptureFrame["features"]; private frameIndex = 0; private readonly extractor: VisionExtractor; private readonly matcher: FeatureMatcher; private readonly poseEstimator: LivePoseEstimator; private readonly onSession?: LiveReconstructionProcessorOptions["onSession"];
  constructor(options: LiveReconstructionProcessorOptions) { this.pipeline = new CapturePipeline(options); this.extractor = options.extractor; this.matcher = options.matcher; this.poseEstimator = options.poseEstimator; this.onSession = options.onSession; }
  async process(frame: ScanFrame): Promise<boolean> { const features = await this.extractor.extract(frame); if (features.keypoints.length < 4) return false; const pose = await this.poseEstimator.estimate(frame, this.previousPose); if (!pose) return false; const captureFrame: CaptureFrame = { id: `frame:${this.frameIndex}`, frameIndex: this.frameIndex++, timestampMs: frame.timestampMs, features }; const result = this.previousFeatures ? this.pipeline.process(captureFrame, this.matcher, pose) : this.pipeline.initialize(captureFrame, pose); if (!result.accepted) return false; this.previousFeatures = features; this.previousPose = pose; if (result.session) this.onSession?.(result.session); return true; }
  reset(): void { this.pipeline.reset(); this.poseEstimator.reset(); this.previousPose = undefined; this.previousFeatures = undefined; this.frameIndex = 0; }
  snapshot() { return this.pipeline.snapshot(); }
}
