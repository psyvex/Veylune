import type { FeatureMatch } from "./features";

export interface RelocalizationCandidate {
  readonly keyframeId: string;
  readonly matches: readonly FeatureMatch[];
  readonly confidence: number;
}

export interface RelocalizationPolicy {
  readonly minimumMatches: number;
  readonly minimumConfidence: number;
}

export const DEFAULT_RELOCALIZATION_POLICY: RelocalizationPolicy = {
  minimumMatches: 20,
  minimumConfidence: 0.65,
};

export function selectRelocalizationCandidate(
  candidates: readonly RelocalizationCandidate[],
  policy: RelocalizationPolicy = DEFAULT_RELOCALIZATION_POLICY,
): RelocalizationCandidate | undefined {
  return [...candidates]
    .filter((candidate) => candidate.matches.length >= policy.minimumMatches && candidate.confidence >= policy.minimumConfidence)
    .sort((a, b) => b.confidence - a.confidence || b.matches.length - a.matches.length)[0];
}
