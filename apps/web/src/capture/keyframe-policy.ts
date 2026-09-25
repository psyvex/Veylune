import type { CameraPose } from "./triangulation";

export interface KeyframeDecisionInput { readonly confidence: number; readonly inliers: number; readonly translationDelta: number; readonly rotationDeltaRad: number; readonly elapsedMs: number; readonly force?: boolean; }
export interface KeyframePolicyOptions { readonly minConfidence?: number; readonly minInliers?: number; readonly minTranslation?: number; readonly minRotationRad?: number; readonly maxIntervalMs?: number; }

export class KeyframePolicy {
  private readonly options: Required<KeyframePolicyOptions>;
  constructor(options: KeyframePolicyOptions = {}) { this.options = { minConfidence: 0.45, minInliers: 8, minTranslation: 0.02, minRotationRad: 0.04, maxIntervalMs: 2000, ...options }; }
  shouldInsert(input: KeyframeDecisionInput): boolean {
    if (input.force) return true;
    // Time-based force: bypass quality gate when too long since last keyframe
    if (input.elapsedMs >= this.options.maxIntervalMs) return true;
    if (input.confidence < this.options.minConfidence || input.inliers < this.options.minInliers) return false;
    return input.translationDelta >= this.options.minTranslation || input.rotationDeltaRad >= this.options.minRotationRad;
  }
}

export function poseTranslationDelta(previous: CameraPose, current: CameraPose): number { return Math.hypot(current.translation[0] - previous.translation[0], current.translation[1] - previous.translation[1], current.translation[2] - previous.translation[2]); }
export function poseRotationDeltaRad(previous: CameraPose, current: CameraPose): number { const r = previous.rotation; const c = current.rotation; const relativeTrace = r[0] * c[0] + r[1] * c[1] + r[2] * c[2] + r[3] * c[3] + r[4] * c[4] + r[5] * c[5] + r[6] * c[6] + r[7] * c[7] + r[8] * c[8]; return Math.acos(Math.max(-1, Math.min(1, (relativeTrace - 1) / 2))); }
