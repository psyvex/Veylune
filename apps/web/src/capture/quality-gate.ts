import type { FrameQualitySignal } from "../inference/quality";

export type CaptureGuidance = "good" | "move" | "hold_steady" | "improve_lighting" | "closer_resolution";

export function captureGuidance(signal: FrameQualitySignal): CaptureGuidance {
  if (signal.exposure < 0.2) return "improve_lighting";
  if (signal.sharpness < 0.08) return "hold_steady";
  if (!signal.usable) return "closer_resolution";
  return "good";
}
