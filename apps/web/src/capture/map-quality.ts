import type { Landmark } from "./map";

export interface LandmarkQuality {
  readonly id: string;
  readonly reprojectionErrorPx: number;
  readonly observations: number;
  readonly quality: number;
}

export interface MapQualityPolicy {
  readonly maxReprojectionErrorPx: number;
  readonly minimumObservations: number;
  readonly minimumQuality: number;
}

export const DEFAULT_MAP_QUALITY_POLICY: MapQualityPolicy = {
  maxReprojectionErrorPx: 3,
  minimumObservations: 2,
  minimumQuality: 0.25,
};

export function scoreLandmark(
  landmark: Landmark,
  reprojectionErrorPx: number,
  policy: MapQualityPolicy = DEFAULT_MAP_QUALITY_POLICY,
): LandmarkQuality {
  const errorScore = Number.isFinite(reprojectionErrorPx)
    ? Math.max(0, 1 - reprojectionErrorPx / policy.maxReprojectionErrorPx)
    : 0;
  const observationScore = Math.min(1, landmark.observations / policy.minimumObservations);
  return {
    id: landmark.id,
    reprojectionErrorPx,
    observations: landmark.observations,
    quality: errorScore * 0.7 + observationScore * 0.3,
  };
}

export function shouldPruneLandmark(
  quality: LandmarkQuality,
  policy: MapQualityPolicy = DEFAULT_MAP_QUALITY_POLICY,
): boolean {
  return quality.observations < policy.minimumObservations || quality.quality < policy.minimumQuality;
}
