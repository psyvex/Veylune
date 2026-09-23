export interface FrameMetrics {
  readonly sharpness: number;
  readonly brightness: number;
  readonly contrast: number;
  readonly motion: number;
}

export interface CaptureQuality {
  readonly score: number;
  readonly acceptable: boolean;
  readonly metrics: FrameMetrics;
}

export function scoreCaptureQuality(metrics: FrameMetrics): CaptureQuality {
  const sharpness = clamp01(metrics.sharpness);
  const brightness = clamp01(1 - Math.abs(metrics.brightness - 0.5) * 2);
  const contrast = clamp01(metrics.contrast);
  const motion = clamp01(1 - metrics.motion);
  const score = sharpness * 0.4 + brightness * 0.2 + contrast * 0.15 + motion * 0.25;
  return { score, acceptable: score >= 0.55, metrics };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}
