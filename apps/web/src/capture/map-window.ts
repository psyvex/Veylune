import type { Keyframe } from "./map";

export interface MapWindowPolicy {
  readonly maxKeyframes: number;
  readonly maxLandmarks: number;
}

export interface MapWindowState {
  readonly keyframes: readonly Keyframe[];
  readonly evictedKeyframeIds: readonly string[];
}

export const DEFAULT_MAP_WINDOW_POLICY: MapWindowPolicy = {
  maxKeyframes: 24,
  maxLandmarks: 5000,
};

export function selectActiveKeyframes(
  keyframes: readonly Keyframe[],
  currentFrameIndex: number,
  policy: MapWindowPolicy = DEFAULT_MAP_WINDOW_POLICY,
): MapWindowState {
  const ordered = [...keyframes].sort((a, b) => Math.abs(a.frameIndex - currentFrameIndex) - Math.abs(b.frameIndex - currentFrameIndex));
  const active = ordered.slice(0, Math.max(1, policy.maxKeyframes));
  const activeIds = new Set(active.map((frame) => frame.id));
  return {
    keyframes: active,
    evictedKeyframeIds: ordered.filter((frame) => !activeIds.has(frame.id)).map((frame) => frame.id),
  };
}
