import type { PoseEstimate, ScanGuidance, ViewpointCoverage } from "./pose";

export interface GuidanceState {
  readonly guidance: ScanGuidance;
  readonly confidence: number;
  readonly changed: boolean;
}

export function deriveGuidance(
  coverage: ViewpointCoverage,
  previous?: PoseEstimate,
): GuidanceState {
  const latest = coverage.samples.at(-1);
  if (!latest || latest.confidence < 0.5) {
    return { guidance: "insufficient_tracking", confidence: latest?.confidence ?? 0, changed: true };
  }

  if (coverage.confidence >= 0.85) {
    return { guidance: "coverage_good", confidence: coverage.confidence, changed: true };
  }

  if (!previous) {
    return { guidance: "change_viewpoint", confidence: latest.confidence, changed: true };
  }

  const dx = latest.x - previous.x;
  const dy = latest.y - previous.y;
  const dz = latest.z - previous.z;
  const distance = Math.hypot(dx, dy, dz);

  if (distance < 0.05) return { guidance: "change_viewpoint", confidence: latest.confidence, changed: true };
  if (Math.abs(dx) >= Math.abs(dy) && Math.abs(dx) >= Math.abs(dz)) {
    return { guidance: dx > 0 ? "move_right" : "move_left", confidence: latest.confidence, changed: true };
  }
  if (Math.abs(dy) >= Math.abs(dz)) {
    return { guidance: dy > 0 ? "move_up" : "move_down", confidence: latest.confidence, changed: true };
  }
  return { guidance: dz > 0 ? "move_farther" : "move_closer", confidence: latest.confidence, changed: true };
}
