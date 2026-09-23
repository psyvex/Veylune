export interface Keypoint {
  readonly x: number;
  readonly y: number;
  readonly score: number;
}

export interface FeatureDescriptor {
  readonly values: Float32Array;
  readonly dimension: number;
}

export interface FeatureSet {
  readonly keypoints: readonly Keypoint[];
  readonly descriptors: readonly FeatureDescriptor[];
}

export interface FeatureMatcher {
  match(reference: FeatureSet, current: FeatureSet): readonly FeatureMatch[];
}

export interface FeatureMatch {
  readonly referenceIndex: number;
  readonly currentIndex: number;
  readonly distance: number;
}

export function retainReliableMatches(
  matches: readonly FeatureMatch[],
  maxDistance: number,
): readonly FeatureMatch[] {
  return matches
    .filter((match) => Number.isFinite(match.distance) && match.distance >= 0 && match.distance <= maxDistance)
    .sort((a, b) => a.distance - b.distance);
}

export function estimateTrackingConfidence(
  matches: readonly FeatureMatch[],
  minimumMatches = 12,
): number {
  if (matches.length === 0) return 0;
  return Math.min(1, matches.length / minimumMatches);
}
