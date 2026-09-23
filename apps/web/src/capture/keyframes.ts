import type { FeatureTrack } from "./tracks";

export interface KeyframeSelectionState {
  readonly lastFrameIndex: number;
  readonly lastTimestampMs: number;
  readonly selectedCount: number;
}

export interface KeyframeSelectionInput {
  readonly frameIndex: number;
  readonly timestampMs: number;
  readonly trackingConfidence: number;
  readonly medianParallaxPx: number;
  readonly stableTracks: readonly FeatureTrack[];
}

export interface KeyframePolicy {
  readonly minimumIntervalMs: number;
  readonly minimumParallaxPx: number;
  readonly minimumStableTracks: number;
  readonly maxTrackingConfidenceForRecovery: number;
}

export const DEFAULT_KEYFRAME_POLICY: KeyframePolicy = {
  minimumIntervalMs: 500,
  minimumParallaxPx: 8,
  minimumStableTracks: 40,
  maxTrackingConfidenceForRecovery: 0.35,
};

export function shouldCreateKeyframe(
  input: KeyframeSelectionInput,
  previous: KeyframeSelectionState | undefined,
  policy: KeyframePolicy = DEFAULT_KEYFRAME_POLICY,
): boolean {
  if (input.stableTracks.length < policy.minimumStableTracks) return false;
  if (!Number.isFinite(input.timestampMs) || !Number.isFinite(input.medianParallaxPx)) return false;
  if (!previous) return true;

  const elapsed = input.timestampMs - previous.lastTimestampMs;
  if (elapsed < policy.minimumIntervalMs) return false;

  return input.medianParallaxPx >= policy.minimumParallaxPx
    || input.trackingConfidence <= policy.maxTrackingConfidenceForRecovery;
}
